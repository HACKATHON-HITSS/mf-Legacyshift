import { CodeFinding, redactEvidence } from './project-findings';

export type SecurityScan = { files: number; checks: number; omittedCandidates: number };
const SUPPORTED = ['Java', 'Kotlin', 'Groovy', 'JavaScript', 'TypeScript', 'C#', 'Python', 'SQL / PL/SQL', 'Properties', 'JSON'];

/** Quita comentarios conservando líneas y cadenas; produce también una vista sin literales. */
function sourceViews(source: string, language: string) {
  let clean = '', code = '', state = 'code', quote = '';
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (state === 'line') {
      clean += /[\r\n]/.test(c) ? c : ' '; code += /[\r\n]/.test(c) ? c : ' ';
      if (/[\r\n]/.test(c)) state = 'code';
    } else if (state === 'block') {
      if (c === '*' && next === '/') { clean += '  '; code += '  '; i++; state = 'code'; }
      else { clean += /[\r\n]/.test(c) ? c : ' '; code += /[\r\n]/.test(c) ? c : ' '; }
    } else if (state === 'string') {
      clean += c; code += /[\r\n]/.test(c) ? c : ' ';
      if (c === '\\' && next !== undefined) { clean += next; code += /[\r\n]/.test(next) ? next : ' '; i++; }
      else if (c === quote) state = 'code';
    } else if (c === '/' && next === '/' && language !== 'Properties') {
      clean += '  '; code += '  '; i++; state = 'line';
    } else if (c === '/' && next === '*') {
      clean += '  '; code += '  '; i++; state = 'block';
    } else if ((c === '#' && ['Python', 'Properties'].includes(language)) || (c === '-' && next === '-' && language === 'SQL / PL/SQL')) {
      clean += ' '; code += ' '; state = 'line';
    } else if (c === '"' || c === "'" || c === '`') {
      clean += c; code += ' '; state = 'string'; quote = c;
    } else { clean += c; code += c; }
  }
  return { clean: clean.split(/\r\n|\r|\n/), code: code.split(/\r\n|\r|\n/) };
}

const externalInput = /\b(?:req|request)\s*\.\s*(?:body|query|params|headers|getParameter|getHeader|getInputStream)\b|\b(?:input|userInput|userData|argv)\b/;
const secretName = /(?:password|passwd|secret|token|api[_-]?key|credential)/i;

export const SECURITY_VALIDATION_AGENT = {
  id: 'validador-seguridad-estatica',
  name: 'Validador local de señales de seguridad',
  analyze(source: string, path: string, language: string, candidates: CodeFinding[] = []) {
    const findings: CodeFinding[] = [];
    if (!SUPPORTED.includes(language)) return { findings, scan: { files: 0, checks: 0, omittedCandidates: candidates.length } };
    const views = sourceViews(source, language);
    let checks = 0;
    const add = (line: number, ruleId: string, title: string, status: 'pattern' | 'review', checked: string, conclusion: string, nextStep: string, severity: CodeFinding['severity'] = 'Media') => {
      findings.push({ id: `security:${path}:${line}:${ruleId}`, category: 'vulnerabilidades', path, line, title,
        condition: checked, action: nextStep, evidence: ruleId === 'literal-secret' ? 'Valor sensible omitido. Revisa el archivo original en la ubicación indicada.' : redactEvidence(views.clean[line - 1].trim()), severity,
        limitation: 'Comprobación estática local. No ejecuta código, no prueba explotación ni resuelve flujos entre archivos.',
        security: { ruleId, status, checked, conclusion, nextStep } });
    };
    views.code.forEach((code, index) => {
      const raw = views.clean[index];
      if (!raw.trim() || (language === 'Properties' && /^\s*!/.test(raw))) return;
      checks += language === 'Properties' ? 1 : 7;
      // A field name, import, URL, placeholder or variable assignment is not a literal credential.
      for (const assignment of raw.matchAll(/(?:["']([\w.$-]+)["']|\b([\w.$-]+))\s*[:=]\s*(["'`])((?:\\.|(?!\3)[^\\\r\n])*)\3/g)) {
        const name = assignment[1] ?? assignment[2], value = assignment[4];
        const offset = assignment.index!;
        const actualAssignment = /[:=]/.test(code.slice(offset, offset + assignment[0].length));
        if (!actualAssignment || !secretName.test(name) || /(?:type|name|label|field|enabled|length|header|pattern)$/i.test(name)) continue;
        if (!value.trim() || /\$\{|%[^%]+%|^ENC\(|^\[.*\]$|^(?:change.?me|placeholder|example|your[_-].*|<.*>)$/i.test(value)) continue;
        add(index + 1, 'literal-secret', 'Posible credencial escrita en el archivo', 'pattern', 'Se comprobó una asignación literal a un campo sensible. El valor se oculta.', 'Hay un valor literal que debe revisarse; no se ha comprobado que sea una credencial activa.', 'Confirma si el valor es real. Si lo es, retíralo del código y revisa su exposición y sustitución.', 'Alta');
        break;
      }
      if (language === 'Properties') {
        const property = /^\s*([\w.-]+)\s*[=:]\s*(\S.*?)\s*$/.exec(raw);
        if (property && secretName.test(property[1]) && !/(?:type|name|label|field|enabled|length|header|pattern)$/i.test(property[1]) &&
          !/^["']|\$\{|^ENC\(|^\[.*\]$|^<.*>$|^(?:change.?me|placeholder|example)$/i.test(property[2])) {
          add(index + 1, 'literal-secret', 'Posible credencial escrita en configuración', 'pattern', 'Se comprobó un valor fijo en una propiedad sensible. El valor se oculta.', 'La configuración contiene un posible secreto literal; su validez y exposición requieren revisión.', 'Confirma si se utiliza como credencial. Si es real, muévelo a una configuración protegida y revisa su sustitución.', 'Alta');
        }
        return;
      }
      const sensitiveCall = /(?<![\w.])(?:eval|exec)\s*\(|\bRuntime\.getRuntime\s*\(\s*\)\s*\.exec\s*\(|\b(?:child_process|childProcess)\.exec\s*\(|\.innerHTML\s*(?:\+?=)|\bdocument\.write\s*\(|\binsertAdjacentHTML\s*\(/.exec(code);
      if (sensitiveCall) {
        const expression = raw.slice(sensitiveCall.index + sensitiveCall[0].length).replace(/\)\s*;?\s*$/, '').trim();
        const fixedLiteral = /^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*;?$/.test(expression);
        if (!fixedLiteral) add(index + 1, 'sensitive-call', 'Revisar datos usados para ejecutar código o generar HTML', externalInput.test(code) ? 'pattern' : 'review', externalInput.test(code) ? 'Una referencia a datos externos aparece en la misma línea que la operación sensible.' : 'Se comprobó la llamada sensible, pero no el origen ni las protecciones de sus datos.', 'La llamada necesita revisión de contexto; no se ha demostrado que pueda explotarse.', 'Sigue el origen del dato y comprueba las protecciones antes de ejecutar código o insertar contenido.', externalInput.test(code) ? 'Alta' : 'Media');
      }
      const sqlLiteral = /["'`](?:[^"'`\r\n]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b)[^"'`\r\n]*["'`]/i.test(raw);
      if (sqlLiteral && (/\+\s*[A-Za-z_$]|\b[A-Za-z_$]\w*\s*\+/.test(code) || /\$\{/.test(raw))) {
        add(index + 1, 'dynamic-sql', 'Consulta de base de datos construida con variables', 'review', 'Se encontró texto SQL junto con concatenación o interpolación.', 'Se comprobó cómo se construye el texto, pero no su ejecución ni si usa datos externos.', 'Comprueba de dónde vienen los valores y si se envían separados de la consulta mediante parámetros.', 'Alta');
      }
      if (/\b(?:md5|sha1)\s*\(/i.test(code) || (/\b(?:MessageDigest\.getInstance|hashlib\.new)\s*\(/.test(code) && /["'](?:MD5|SHA-?1)["']/i.test(raw))) {
        add(index + 1, 'weak-hash', 'Revisar para qué se utiliza MD5 o SHA-1', 'pattern', 'Se comprobó una llamada a MD5 o SHA-1 fuera de comentarios.', 'El algoritmo está presente; el riesgo depende de si protege información o se usa con otro propósito.', 'Confirma su finalidad. Si se usa para seguridad, revisa la alternativa adecuada con el equipo.');
      }
      if (/\bpickle\.loads\s*\(|\bunserialize\s*\(|\.readObject\s*\(/.test(code)) {
        add(index + 1, 'deserialize', 'Revisar el origen de objetos cargados desde datos', 'review', 'Se comprobó una llamada de carga de objetos. No se marca un nombre genérico como loads por sí solo.', 'Falta confirmar si el contenido viene de una fuente confiable y qué controles tiene.', 'Verifica quién controla los datos y qué formatos o tipos permite cargar.');
      }
      if (/\b(?:console\.(?:log|info|error|debug)|logger\.(?:info|error|debug|warn)|System\.out\.println|print)\s*\(/.test(code) && /\b\w*(?:password|passwd|secret|token|apiKey|api_key)\w*\b/i.test(code)) {
        add(index + 1, 'secret-log', 'Revisar un dato sensible enviado al registro', 'review', 'Un nombre de dato sensible aparece como argumento de una llamada de registro, fuera de cadenas y comentarios.', 'No se ha comprobado si el valor ya está oculto o transformado antes de registrarse.', 'Confirma qué valor llega al registro y ocúltalo si contiene información sensible.', 'Alta');
      }
      if (/\bverify\s*=\s*False\b|\brejectUnauthorized\s*:\s*false\b/.test(code)) {
        add(index + 1, 'tls-check', 'Revisar una verificación de conexión desactivada', 'review', 'Se encontró verify=False o rejectUnauthorized:false en código.', 'Es necesario comprobar a qué llamada pertenece y si se utiliza fuera de pruebas.', 'Revisa la conexión afectada y confirma que la validación del certificado esté activa donde corresponda.');
      }
    });
    const retainedLines = new Set(findings.map(item => item.line));
    return { findings, scan: { files: 1, checks, omittedCandidates: candidates.filter(item => !retainedLines.has(item.line)).length } };
  }
} as const;
