export type FindingCategory = 'reglas' | 'condiciones' | 'logica' | 'entradas-salidas' | 'deuda-tecnica' | 'vulnerabilidades';

export type CodeFinding = {
  id: string;
  category: FindingCategory;
  path: string;
  line: number;
  title: string;
  condition: string;
  action: string;
  evidence: string;
  severity: 'Informativa' | 'Media' | 'Alta';
  limitation: string;
};

// Values are deliberately omitted from evidence, including conditions and exports.
export function redactEvidence(value: string): string {
  return value
    .replace(/(["'`])(?:\\.|(?!\1)[^\\\r\n])*?\1/g, '"[literal omitido]"')
    .replace(/\b(?:password|passwd|secret|token|api[_-]?key)\b\s*[:=].*/gi, '[asignación sensible omitida]')
    .replace(/(?:https?:\/\/|jdbc:)\S+/gi, '[conexión omitida]')
    .slice(0, 400);
}

export function extractCodeFindings(text: string, path: string, language: string): CodeFinding[] {
  if (!['Java', 'Kotlin', 'Groovy', 'TypeScript', 'JavaScript', 'C#', 'Python', 'SQL / PL/SQL', 'Visual Basic'].includes(language)) return [];
  const findings: CodeFinding[] = [];
  const rawLines = text.split(/\r\n|\r|\n/);
  // Remove comments and mask strings before looking for syntax to avoid matches in prose.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\r\n]/g, ' '))
    .replace(/(["'`])(?:\\.|(?!\1)[^\\])*?\1/g, match => match.replace(/[^\r\n]/g, ' '));
  const lines = code.split(/\r\n|\r|\n/);
  const add = (category: FindingCategory, index: number, title: string, condition: string, action: string, severity: CodeFinding['severity'], limitation: string) => {
    findings.push({ id: `${category}:${path}:${index + 1}:${findings.length}`, category, path, line: index + 1,
      title, condition: redactEvidence(condition), action: redactEvidence(action),
      evidence: redactEvidence(rawLines[index]?.trim() ?? ''), severity, limitation });
  };
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (/^(?:\/\/|#|--)/.test(trimmed) || !trimmed) continue;
    const method = /\b(?:public|private|protected|internal)\s+(?:(?:static|async|final|virtual|override)\s+)*[\w<>[\],.?]+\s+(\w+)\s*\(/.exec(line)
      ?? /\b(?:function|def)\s+(\w+)\s*\(/.exec(line)
      ?? /^\s*(?:export\s+)?(?:const|let)\s+(\w+)\s*=.*=>/.exec(line);
    if (method) add('logica', index, `Operación ${method[1]}`, 'Declaración de función o método', 'Flujo interno pendiente de revisión', 'Informativa', 'No reconstruye llamadas ni ejecución entre métodos.');

    if (/\b(?:if\s*\(|if\s+.+:|IF\s+.+\bTHEN|when\s*\(|case\s+\w+)/.test(line)) {
      const continuation: string[] = [rawLines[index].trim()];
      if (/\bif\s*\(/i.test(line)) {
        let balance = (line.match(/\(/g)?.length ?? 0) - (line.match(/\)/g)?.length ?? 0);
        for (let next = index + 1; balance > 0 && next < Math.min(lines.length, index + 12); next++) {
          continuation.push(rawLines[next].trim());
          balance += (lines[next].match(/\(/g)?.length ?? 0) - (lines[next].match(/\)/g)?.length ?? 0);
        }
      }
      const condition = continuation.join(' ');
      const bodyIndex = index + continuation.length;
      const action = /\)\s*\S/.test(condition) ? condition.replace(/^.*?\)\s*/, '') : '';
      const nextAction = action.replace(/^[{\s]+/, '') || rawLines.slice(bodyIndex, bodyIndex + 4).map(value => value.trim()).find(value => value && !/^(?:[{}]|\/\/|#|--)/.test(value)) || 'Acción no resuelta';
      const limitation = 'Condición detectada por patrones; confirmar significado, ramas y contexto con el responsable del negocio.';
      add('condiciones', index, 'Condición de control', condition, nextAction, 'Informativa', limitation);
      add('reglas', index, 'Regla candidata a validar', condition, nextAction, 'Informativa', limitation);
    }
    if (/\b(?:for|while|foreach)\s*\(|\bfor\s+.+\s+in\s+/.test(line)) {
      add('logica', index, 'Iteración', rawLines[index], 'Repetición de un bloque', 'Informativa', 'No se estima el número de iteraciones ni su coste real.');
    }
    if (/\b(?:return|throw|raise)\b/.test(line)) {
      add('logica', index, /\b(?:throw|raise)\b/.test(line) ? 'Salida por excepción' : 'Retorno', 'Salida de una operación', rawLines[index], 'Informativa', 'El tipo y el valor final requieren revisión.');
    }
    if (/@(?:Get|Post|Put|Delete|Patch|Request)Mapping\b|@(?:GET|POST|PUT|DELETE|Path)\b|\b(?:app|router)\.(?:get|post|put|delete|patch)\s*\(/.test(line)) {
      add('entradas-salidas', index, 'Entrada HTTP declarada', 'Petición HTTP', 'Contrato detectado en anotación o ruta', 'Informativa', 'No se infieren esquemas completos ni se ejecuta el endpoint.');
    }
    if (/\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i.test(line) && language === 'SQL / PL/SQL') {
      add('entradas-salidas', index, 'Operación de persistencia', 'Acceso SQL', rawLines[index], 'Informativa', 'Dependencia de datos observada; no se conecta a la base de datos.');
    }
    if (/\b(?:TODO|FIXME|HACK)\b/i.test(rawLines[index])) {
      add('deuda-tecnica', index, 'Pendiente declarado en código', 'Marcador TODO / FIXME / HACK', 'Revisar y resolver el pendiente', 'Media', 'Un marcador no demuestra un defecto funcional.');
    }
    if (/\bcatch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
      add('deuda-tecnica', index, 'Excepción ignorada', 'Bloque catch vacío', 'Revisar el tratamiento del error', 'Media', 'Puede ser intencional; requiere revisión.');
    }
    if (/\beval\s*\(|\bexec\s*\(|Runtime\.getRuntime\s*\(\s*\)\s*\.exec\s*\(|\.innerHTML\s*=|\bdocument\.write\s*\(/.test(line)) {
      add('vulnerabilidades', index, 'Operación sensible', 'Ejecución dinámica o inserción HTML', 'Revisar origen y validación de los datos', 'Alta', 'Riesgo candidato; no se ha comprobado explotabilidad ni flujo de datos.');
    }
    if (/\b(?:md5|sha1)\s*\(/i.test(line)) {
      add('vulnerabilidades', index, 'Algoritmo hash débil para usos criptográficos', 'Uso de MD5 / SHA-1', 'Verificar finalidad y sustituir si protege información', 'Media', 'Puede tener usos no criptográficos legítimos.');
    }
  }
  // Comment-only TODO markers were excluded from syntax checks above.
  rawLines.forEach((line, index) => {
    if (/^\s*(?:\/\/|#|--|\*|\/\*)/.test(line) && /\b(?:TODO|FIXME|HACK)\b/i.test(line)) {
      add('deuda-tecnica', index, 'Pendiente declarado en comentario', 'Marcador TODO / FIXME / HACK', 'Revisar el pendiente', 'Media', 'No demuestra código muerto ni un defecto confirmado.');
    }
  });
  return findings;
}
