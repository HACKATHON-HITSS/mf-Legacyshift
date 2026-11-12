import { extractCodeFindings, CodeFinding, redactEvidence } from './project-findings';
import { BusinessRule, extractBusinessRules } from './business-rules';
import { ProcessFlow, extractProcessFlows } from './process-flow';
import { JavaAnalysis, emptyJavaAnalysis, parseJavaFile, recursionWithoutExit, resolveJavaAnalysis } from './java-analysis';
import { ConfiguredProcedure, ProcedureAnalysis, ProcedureSource, analyzeConfiguredProcedures, describeProcedure, extractConfiguredProcedures } from './stored-procedures';

export type FileAnalysis = {
  sha256?: string | null;
  path: string;
  language: string;
  role: string;
  lines: number;
  status: 'analyzed' | 'skipped' | 'error';
  detail: string;
};

export type AnalysisReference = {
  path: string;
  line: number;
  name: string;
  kind: string;
};

export type LocalAnalysisReport = {
  java: JavaAnalysis;
  processFlows: ProcessFlow[];
  artifactVersion: string | null;
  businessRules: BusinessRule[];
  findings: CodeFinding[];
  files: FileAnalysis[];
  languages: { name: string; files: number; lines: number }[];
  dependencies: AnalysisReference[];
  imports: AnalysisReference[];
  hardcoded: AnalysisReference[];
  operations: { path: string; name: string; input: string; output: string }[];
  storedProcedures: ProcedureAnalysis[];
  analyzed: number;
  skipped: number;
  errors: number;
  totalLines: number;
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const EXCLUDED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.angular', 'coverage', 'bin', 'obj']);
const LANGUAGES: Readonly<Record<string, string>> = {
  java: 'Java', sql: 'SQL / PL/SQL', pks: 'SQL / PL/SQL', pkb: 'SQL / PL/SQL', prc: 'SQL / PL/SQL', fnc: 'SQL / PL/SQL',
  xq: 'XQuery', xqy: 'XQuery', xquery: 'XQuery', xsl: 'XSLT', xslt: 'XSLT', proxy: 'OSB', pipeline: 'OSB', biz: 'OSB', bix: 'OSB',
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
  py: 'Python', cs: 'C#', vb: 'Visual Basic', kt: 'Kotlin', groovy: 'Groovy',
  xml: 'XML', wsdl: 'WSDL', jpr: 'JDeveloper', jws: 'JDeveloper', jaxrpc: 'JAX-RPC',
  properties: 'Properties', json: 'JSON', yaml: 'YAML', yml: 'YAML',
  html: 'HTML', css: 'CSS', scss: 'SCSS', txt: 'Texto', md: 'Markdown',
  gradle: 'Gradle', kts: 'Kotlin', sh: 'Shell', bat: 'Batch', ps1: 'PowerShell'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function roleFor(path: string): string {
  if (/\.(?:wsdl|jaxrpc)$/i.test(path)) return 'Contrato de servicio';
  if (/(?:^|\/)(?:dao|repository|repositories)\//i.test(path)) return 'Persistencia';
  if (/(?:^|\/)(?:service|services)\//i.test(path)) return 'Servicios';
  if (/(?:^|\/)(?:controller|controllers)\//i.test(path)) return 'Entrada HTTP';
  if (/(?:^|\/)(?:bean|beans|types|dto|model)\//i.test(path)) return 'Modelo / datos';
  if (/\.(?:xml|properties|json|ya?ml|jpr|jws)$/i.test(path)) return 'Configuración';
  return 'Archivo fuente / recurso';
}

export async function analyzeLocalProject(
  files: readonly File[],
  onProgress: (processed: number) => void
): Promise<LocalAnalysisReport> {
  const report: LocalAnalysisReport = {
    java: emptyJavaAnalysis(), processFlows: [], artifactVersion: null, businessRules: [], findings: [], files: [], languages: [], dependencies: [], imports: [], hardcoded: [], operations: [], storedProcedures: [],
    analyzed: 0, skipped: 0, errors: 0, totalLines: 0
  };
  const languages = new Map<string, { name: string; files: number; lines: number }>();
  const packages = new Set<string>();
  const imports: AnalysisReference[] = [];
  const javaParts: JavaAnalysis[] = [];
  const procedures: ConfiguredProcedure[] = [];
  const procedureSources: ProcedureSource[] = [];

  for (const [index, file] of files.entries()) {
    const path = file.webkitRelativePath || file.name;
    const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
    const language = LANGUAGES[extension] ?? 'No reconocido';
    const entry: FileAnalysis = { path, language, role: roleFor(path), lines: 0, status: 'skipped', detail: '' };
    report.files.push(entry);
    const excluded = path.split('/').slice(0, -1).some(part => EXCLUDED_DIRECTORIES.has(part));

    if (excluded) {
      entry.detail = 'Carpeta de dependencias instaladas, compilación o control de versiones.';
    } else {
      if (extension === 'jar') {
        report.dependencies.push({ path, line: 0, name: file.name, kind: 'JAR incluido (versión y uso sin verificar)' });
      }
      if (language === 'No reconocido') {
        entry.detail = 'Formato no compatible. No se descomprimen JAR ni ZIP anidados; no se extrae texto de PDF/Word.';
      } else if (file.size > MAX_FILE_BYTES) {
        entry.detail = 'Supera el límite local de 5 MB por archivo.';
      } else {
        await analyzeFile(file, entry, report, languages, packages, imports, javaParts, procedures, procedureSources);
      }
    }
    if (entry.status === 'analyzed') report.analyzed++;
    else if (entry.status === 'error') report.errors++;
    else report.skipped++;
    onProgress(index + 1);
    // Yield between files so progress and controls can render during large selections.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }

  report.java = resolveJavaAnalysis(javaParts);
  for (const method of report.java.methods) for (const condition of method.conditions.filter(item => item.kind === 'ifStatement')) {
    const file = report.files.find(item => item.path === method.path);
    report.businessRules.push({
      ruleId: `java-rule:${condition.id}`, ruleName: `Condición en ${method.className}.${method.name}`, ruleType: 'OTHER',
      condition: condition.expression, component: `${method.className}.${method.name}`, dependencies: [], path: method.path,
      location: `línea ${condition.evidence.startLine}`, snippet: condition.evidence.snippet,
      limitations: 'Condición técnica detectada en Java; la acción y su significado de negocio requieren revisión.',
      businessDescription: '', result: '', inputs: [], outputs: [], componentId: method.classId, componentType: 'Método Java',
      discoveryMethod: 'Árbol sintáctico Java', createdAt: new Date().toISOString(), artifactHash: file?.sha256 ?? null, artifactVersion: null,
      evidenceId: `EV:${condition.id}`, artifactType: 'JAVA', locationType: 'LINE', startLine: condition.evidence.startLine,
      endLine: condition.evidence.endLine, xmlNodePath: ''
    });
  }
  for (const [index, cycle] of recursionWithoutExit(report.java).entries()) {
    const call = cycle.calls[0];
    const names = cycle.methods.map(method => `${method.className}.${method.name}`);
    report.findings.push({
      id: `deuda-tecnica:${call.evidence.path}:${call.evidence.startLine}:recursion-${index}`, category: 'deuda-tecnica',
      path: call.evidence.path, line: call.evidence.startLine,
      title: names.length === 1 ? 'Recursión sin condición de salida' : 'Recursión mutua sin condición de salida',
      condition: names.length === 1 ? `${names[0]} se invoca a sí mismo` : `Ciclo de llamadas: ${names.join(' → ')} → ${names[0]}`,
      action: 'Añadir un caso base o revisar si la llamada es intencional', evidence: redactEvidence(call.evidence.snippet),
      severity: 'Alta',
      limitation: 'Basado en llamadas resueltas por tipo declarado, sin ramas, bucles, ternarios ni && / || en los métodos del ciclo. No considera excepciones de otras llamadas, estado externo ni código dentro de lambdas.'
    });
  }
  report.storedProcedures = analyzeConfiguredProcedures(procedures, procedureSources, report.java);
  for (const [index, item] of report.storedProcedures.entries()) {
    const status = { INVOCADO: 'invocado', LEIDO_SIN_LLAMADA: 'referenciado sin llamada directa', SIN_REFERENCIAS: 'sin uso' }[item.status];
    report.dependencies.push({ path: item.path, line: item.line, name: `${item.procedure} (clave ${item.key})`, kind: `Procedimiento almacenado configurado en properties, ${status}. ${describeProcedure(item)}.` });
    for (const usage of item.usages.filter(value => value.invokes)) {
      report.findings.push({
        id: `entradas-salidas:${usage.path}:${usage.line}:sp-${index}`, category: 'entradas-salidas', path: usage.path, line: usage.line,
        title: `Invocación de ${item.procedure}`, condition: `Clave ${item.key} (${item.path}:${item.line}) · ${usage.kind}${usage.constant ? ` ${usage.constant}` : ''}`,
        action: `Llamada JDBC a procedimiento almacenado en ${usage.method}`, evidence: redactEvidence(usage.evidence), severity: 'Informativa',
        limitation: 'La clave se usa en un método que realiza una llamada a procedimiento; no se verifica que el valor leído sea el mismo que se pasa a esa llamada.'
      });
    }
    if (item.status !== 'INVOCADO') {
      report.findings.push({
        id: `deuda-tecnica:${item.path}:${item.line}:sp-${index}`, category: 'deuda-tecnica', path: item.path, line: item.line,
        title: item.status === 'SIN_REFERENCIAS' ? 'Procedimiento configurado sin uso' : 'Procedimiento configurado sin invocación directa',
        condition: `${item.key} = ${item.procedure}`, action: item.status === 'SIN_REFERENCIAS' ? 'Confirmar si la configuración es obsoleta antes de migrarla' : 'Seguir el valor leído hasta la llamada JDBC',
        evidence: describeProcedure(item), severity: 'Media',
        limitation: 'Solo se buscan la clave literal, constantes que la contienen, ${clave} y el nombre del SP en los archivos analizados. Claves construidas dinámicamente, reflexión o código fuera de la selección no se detectan.'
      });
    }
  }
  report.imports = imports.filter(item => ![...packages].some(pkg => item.name.startsWith(`${pkg}.`)));
  report.languages = [...languages.values()].sort((a, b) => b.files - a.files);
  if (report.files.every(file => file.status === 'analyzed' && file.sha256)) {
    report.artifactVersion = await sha256(new TextEncoder().encode(JSON.stringify(report.files.map(file => [file.path, file.sha256]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))));
  }
  for (const rule of report.businessRules) rule.artifactVersion = report.artifactVersion;
  return report;
}

async function sha256(bytes: Uint8Array): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const copy = new Uint8Array(bytes);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

async function analyzeFile(
  file: File,
  entry: FileAnalysis,
  report: LocalAnalysisReport,
  languages: Map<string, { name: string; files: number; lines: number }>,
  packages: Set<string>,
  imports: AnalysisReference[],
  javaParts: JavaAnalysis[],
  procedures: ConfiguredProcedure[],
  procedureSources: ProcedureSource[]
): Promise<void> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    entry.status = 'error';
    entry.detail = `No se pudo leer el archivo: ${error instanceof Error ? error.message : String(error)}`;
    return;
  }
  if (bytes.subarray(0, 4096).includes(0)) {
    entry.detail = 'Contenido binario o codificación UTF-16 no compatible.';
    return;
  }
  entry.sha256 = await sha256(bytes);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    text = new TextDecoder('windows-1252').decode(bytes);
    entry.detail = 'UTF-8 no válido: leído como Windows-1252; revisar la codificación.';
  }
  entry.status = 'analyzed';
  entry.lines = text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length;
  report.totalLines += entry.lines;
  const stats = languages.get(entry.language) ?? { name: entry.language, files: 0, lines: 0 };
  stats.files++;
  stats.lines += entry.lines;
  languages.set(entry.language, stats);

  report.findings.push(...extractCodeFindings(text, entry.path, entry.language));
  if (entry.language === 'Java') {
    const parsed = parseJavaFile(text, entry.path);
    javaParts.push(parsed);
    if (parsed.errors.length) entry.detail = [entry.detail, parsed.errors[0].detail].filter(Boolean).join(' ');
  }
  if (entry.language === 'Properties') procedures.push(...extractConfiguredProcedures(text, entry.path));
  // Sources are kept until the end of the analysis to search for uses of procedures configured in any file.
  if (['Java', 'XML', 'JDeveloper', 'SQL / PL/SQL'].includes(entry.language)) procedureSources.push({ path: entry.path, language: entry.language, text });
  report.processFlows.push(...extractProcessFlows(text, entry.path, entry.language));
  const rules = extractBusinessRules(text, entry.path);
  for (const rule of rules) rule.artifactHash = entry.sha256;
  report.businessRules.push(...rules);

  if (['OSB', 'XSLT'].includes(entry.language) && new DOMParser().parseFromString(text, 'application/xml').getElementsByTagName('parsererror').length) {
    entry.detail = 'XML inválido: no se pudieron identificar reglas de este artefacto.';
  }

  if (file.name === 'package.json') {
    readNpmDependencies(text, entry, report);
  }
  if (['XML', 'WSDL', 'JDeveloper', 'JAX-RPC'].includes(entry.language)) {
    readXmlReferences(text, entry, report);
  }
  if (['Java', 'Kotlin', 'Groovy', 'TypeScript', 'JavaScript', 'C#', 'Python', 'SQL / PL/SQL', 'Properties'].includes(entry.language)) {
    readSourceReferences(text, entry, report, packages, imports);
  }
}

function readNpmDependencies(text: string, entry: FileAnalysis, report: LocalAnalysisReport): void {
  let manifest: unknown;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    entry.detail = `No se pudieron extraer dependencias: JSON inválido (${error.message}).`;
    return;
  }
  if (!isRecord(manifest)) {
    entry.detail = 'No se pudieron extraer dependencias: package.json no contiene un objeto.';
    return;
  }
  for (const kind of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const values = manifest[kind];
    if (values === undefined) continue;
    if (!isRecord(values)) {
      entry.detail = `No se pudieron leer todas las dependencias: ${kind} no es un objeto.`;
      continue;
    }
    for (const [name, version] of Object.entries(values)) {
      if (typeof version !== 'string') {
        entry.detail = 'Hay versiones de dependencias inválidas en package.json.';
        continue;
      }
      report.dependencies.push({ path: entry.path, line: 0, name: `${name} @ ${version}`, kind });
    }
  }
}

function readXmlReferences(text: string, entry: FileAnalysis, report: LocalAnalysisReport): void {
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0) {
    entry.detail = 'XML inválido: no se extrajeron dependencias ni contratos de este archivo.';
    return;
  }
  if (entry.language === 'JDeveloper') {
    for (const url of Array.from(document.getElementsByTagName('url'))) {
      const path = url.getAttribute('path');
      if (path && /\.jar$/i.test(path)) {
        report.dependencies.push({ path: entry.path, line: 0, name: path, kind: 'JAR referenciado por JDeveloper' });
      }
    }
  }
  if (entry.path.endsWith('/pom.xml') || entry.path === 'pom.xml') {
    for (const dependency of Array.from(document.getElementsByTagNameNS('*', 'dependency'))) {
      const value = (tag: string) => dependency.getElementsByTagNameNS('*', tag)[0]?.textContent?.trim() ?? '';
      const group = value('groupId');
      const artifact = value('artifactId');
      if (group && artifact) {
        report.dependencies.push({
          path: entry.path, line: 0,
          name: `${group}:${artifact} @ ${value('version') || 'heredada / no declarada'}`,
          kind: 'Maven (declaración, sin resolver transitivas)'
        });
      }
    }
  }
  const wsdlNamespace = 'http://schemas.xmlsoap.org/wsdl/';
  for (const port of Array.from(document.getElementsByTagNameNS(wsdlNamespace, 'portType'))) {
    for (const operation of Array.from(port.children).filter(child => child.localName === 'operation')) {
      const message = (kind: string) => Array.from(operation.children)
        .find(child => child.localName === kind)?.getAttribute('message') ?? 'No declarado';
      report.operations.push({
        path: entry.path, name: operation.getAttribute('name') ?? '(sin nombre)',
        input: message('input'), output: message('output')
      });
    }
  }
}

function readSourceReferences(
  text: string,
  entry: FileAnalysis,
  report: LocalAnalysisReport,
  packages: Set<string>,
  imports: AnalysisReference[]
): void {
  // Preserve line numbers while excluding block comments from these heuristic matches.
  const source = text.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\r\n]/g, ' '));
  for (const [index, line] of source.split(/\r\n|\r|\n/).entries()) {
    const trimmed = line.trim();
    if (/^(?:\/\/|#|--)/.test(trimmed)) continue;
    const location = { path: entry.path, line: index + 1 };
    const pkg = /^\s*package\s+([\w.]+)\s*;/.exec(line);
    if (pkg) packages.add(pkg[1]);
    const imported = /^\s*import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;/.exec(line);
    if (imported && !/^(?:java|javax|jakarta)\./.test(imported[1])) {
      imports.push({ ...location, name: imported[1], kind: 'Import Java: biblioteca o código externo, sin mapear a JAR' });
    }
    if (/(?:https?:\/\/|jdbc:[\w]+:)/i.test(line)) {
      report.hardcoded.push({ ...location, name: 'URL o conexión literal', kind: 'Candidato a externalizar; valor no mostrado' });
    }
    if (/\b(?:password|passwd|secret|token|api[_-]?key)\b\s*[:=]\s*(?!["']?\s*(?:\$\{|process\.env|System\.getenv))\S+/i.test(line)) {
      report.hardcoded.push({ ...location, name: 'Configuración sensible con valor literal', kind: 'Revisión manual; valor no mostrado' });
    } else if (/\b(?:[A-Za-z_]\w*)\s*=\s*(?:-?\d+(?:\.\d+)?|["'][^"'\r\n]+["'])\s*[;,]?\s*(?:\/\/.*)?$/.test(line)) {
      report.hardcoded.push({ ...location, name: 'Asignación con valor fijo', kind: 'Heurística: puede ser una constante legítima' });
    }
  }
}
