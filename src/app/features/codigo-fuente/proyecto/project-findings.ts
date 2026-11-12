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
  security?: {
    ruleId: string; status: 'pattern' | 'review'; checked: string; conclusion: string; nextStep: string;
  };
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
    if (/\b(?:password|passwd|api[_-]?key|secret|token|credential)\s*[:=]|(?:password|passwd|api[_-]?key|secret|token)\s*=\s*["'][^"']*["']/.test(line)) {
      add('vulnerabilidades', index, 'Credencial o contraseña hardcodeada', 'Valor sensible asignado literalmente en el código', 'Extraer a variables de entorno o gestor de secretos', 'Alta', 'Riesgo crítico si se expone en control de versiones o logs.');
    }
    if (/(?:\b(?:sql|query|command|statement)\s*[:=].*[\+\.]|concatenation de.*sql|sql\s+injection|strcat|sprintf|String\.format|SELECT.*\+|INSERT.*\+|UPDATE.*\+|DELETE.*\+).*(?:SELECT|INSERT|UPDATE|DELETE|DROP|EXEC|FROM)?/i.test(line)) {
      add('vulnerabilidades', index, 'Concatenación SQL potencial', 'Construcción dinámica de consultas SQL sin prepared statements', 'Usar consultas parametrizadas y prepared statements', 'Alta', 'Riesgo de SQL injection si se incluyen valores del usuario sin sanitizar.');
    }
    if (/\b(?:deserialize|unserialize|pickle\.loads|loads|JSON\.parse.*eval|ObjectInputStream)\s*\(/.test(line)) {
      add('vulnerabilidades', index, 'Deserialización insegura', 'Deserialización de datos no confiables', 'Validar y sanitizar datos antes de deserializar; usar formatos seguros', 'Alta', 'Riesgo de inyección de código o remote code execution si los datos provienen del usuario.');
    }
    if (/\b(?:setDefaultCloseOperation|EXIT_ON_CLOSE|setSecurityManager|System\.exit|DisableAccessWarning)\b|\.newInstance\s*\(|Class\.forName\s*\(/.test(line)) {
      add('vulnerabilidades', index, 'Operación de control de sistema', 'Llamada a métodos de sistema o reflexión', 'Revisar permisos y origen de datos', 'Media', 'Requiere validación de que se ejecuta con intención segura.');
    }
    if (/\b(?:process|execute|load|run|call|invoke)\s*\(\s*["']?[^"']*\$|\\$|%|@\w+@/.test(line)) {
      add('vulnerabilidades', index, 'Inyección de comando en variables de entorno', 'Ejecución con interpolación de variables', 'Validar y escapar variables de entorno antes de usar', 'Alta', 'Riesgo de command injection si las variables provienen del usuario.');
    }
    if (/\b(?:setTimeout|setInterval|eval)\s*\(\s*["']\s*\+|dangerouslySetInnerHTML|innerHTML\s*\+=|innerText\s*=\s*user|insertAdjacentHTML/.test(line)) {
      add('vulnerabilidades', index, 'Inyección XSS potencial', 'Inserción de HTML o JavaScript dinámico sin sanitizar', 'Usar plantillas seguras, escape de HTML, o Content Security Policy', 'Alta', 'Riesgo de Cross-Site Scripting si los datos provienen de entrada del usuario.');
    }
    if (/\b(?:CORS|Access-Control|@CrossOrigin)\b.*\*|\.setAllowCredentials\s*\(\s*true|allowCredentials\s*:\s*true/.test(line)) {
      add('vulnerabilidades', index, 'CORS demasiado permisivo', 'Aceptar solicitudes de cualquier origen con credenciales', 'Especificar orígenes permitidos explícitamente', 'Media', 'Riesgo de acceso no autorizado si se combinan credenciales con CORS abierto.');
    }
    if (/\b(?:admin|administrator|root|superuser|sudo)\b\s*[:=].*(?:password|pass|pwd)|\b(?:default|demo|test|12345|password|letmein)\b\s*[:=]|hardcoded.*(?:admin|user).*[:=]/.test(line)) {
      add('vulnerabilidades', index, 'Cuenta de acceso hardcodeada', 'Credenciales de administrador o usuario predeterminadas en el código', 'Usar un sistema de gestión de identidades autenticado', 'Alta', 'Riesgo crítico si se usan en producción sin cambiar.');
    }
    if (/\b(?:log|console|print|System\.out|logger|printf|sprintf)\s*\.\w+\s*\(\s*["'].*(?:password|secret|token|key|credential|ssn|card)/.test(line)) {
      add('vulnerabilidades', index, 'Información sensible en logs', 'Exposición de secretos en salida o registros de auditoría', 'Usar niveles de log y redactar valores sensibles', 'Alta', 'Riesgo de exposición en logs, dumps o monitoreo inadecuado.');
    }
    if (/\b(?:http|ftp):\/\/|\.xml\b|\.config\b|web\.config|app\.config|\.properties\b.*(?:password|secret|key)/.test(line)) {
      add('vulnerabilidades', index, 'Configuración sensible en archivo de texto', 'Secretos en archivos de configuración sin encriptación', 'Usar gestión de secretos o variables de entorno', 'Media', 'Riesgo si el archivo se expone o se incluye en control de versiones.');
    }
    if (/\b(?:useCallback|useMemo|React\.memo)\s*\(.*password|memo\(.*secret|cache\(.*token|memoize\(.*credential/.test(line)) {
      add('vulnerabilidades', index, 'Datos sensibles en caché o memo', 'Secretos almacenados en memoria caché que puede no limpiarsen', 'No cachear datos sensibles; limpiar al logout', 'Media', 'Riesgo si el caché se persiste o se accede sin autorización.');
    }
    if (/\b(?:deprecated|obsolete|old|legacy|unsafe)\b.*(?:function|method|class|algorithm)|\b(?:unsafePerformMutation|unsafe_unwrap|unwrap_unchecked|memo\.skip_if_equal)\s*\(/.test(line)) {
      add('vulnerabilidades', index, 'API deprecada o insegura', 'Uso de función, método o algoritmo marcado como deprecado o inseguro', 'Actualizar a la alternativa moderna y segura', 'Media', 'Riesgo si la API tiene vulnerabilidades conocidas o fue reemplazada.');
    }
  }
  // Comment-only TODO markers were excluded from syntax checks above.
  rawLines.forEach((line, index) => {
    if (/^\s*(?:\/\/|#|--|\*|\/\*)/.test(line) && /\b(?:TODO|FIXME|HACK)\b/i.test(line)) {
      add('deuda-tecnica', index, 'Pendiente declarado en comentario', 'Marcador TODO / FIXME / HACK', 'Revisar el pendiente', 'Media', 'No demuestra código muerto ni un defecto confirmado.');
    }
    // Security advisories in comments
    if (/(?:security|vulnerability|cve|exploit|bug|flaw|breach|attack|threat)\b/i.test(line) && !/^\s*(?:\/\/|#|--|\*|\/\*)/.test(line.trim())) {
      add('vulnerabilidades', index, 'Posible vulnerabilidad mencionada en código', 'Referencia a riesgo de seguridad en comentario', 'Investigar y resolver el problema identificado', 'Media', 'Comentario sugiere una vulnerabilidad conocida; validar y reparar.');
    }
  });

  // Detect insecure version patterns in dependency declarations
  const dependencyLines = rawLines.filter((_, i) => /package\.json|requirements\.txt|pom\.xml|build\.gradle|\.sbt|\.lock|gemfile/i.test(lines[i]));
  for (const [index, line] of dependencyLines.entries()) {
    if (/["']version["']\s*[:=]\s*["']0\.\d+\.\d+["']|["']version["']\s*[:=]\s*["']\*["']|vulnerable.*version|outdated|deprecated/i.test(line)) {
      add('vulnerabilidades', index, 'Versión de dependencia potencialmente insegura', 'Versión muy antigua o patrón comodín (0.x.x o *)', 'Actualizar a la versión estable y auditada más reciente', 'Media', 'Versiones antiguas pueden contener CVEs conocidas.');
    }
  }

  return findings;
}
