// Mock local del proveedor Huawei MaaS: genera respuestas con datos simulados a partir del contexto recibido,
// sin red ni tokens. Las reglas usan fragmentos copiados del método enviado para superar la verificación del frontend.

const DISCOVERY_MARKER = 'analista de sistemas legados Java';
const MOCK_NOTICE = 'Datos simulados (modo mock, sin IA)';

const words = identifier => identifier
  .replace(/^this\./, '')
  .replace(/\b(?:get|is)([A-Z]\w*)\(\)/g, '$1')
  .replace(/([a-záéíóúñ0-9])([A-Z])/g, '$1 $2')
  .replace(/_/g, ' ')
  .toLowerCase()
  .trim();

function term(expression) {
  const value = expression.trim().replace(/^\((.*)\)$/, '$1').trim();
  if (/^".*"$|^'.*'$/.test(value)) return `"${value.slice(1, -1)}"`;
  if (/^-?\d+(?:\.\d+)?[dDfFlL]?$/.test(value)) return value.replace(/[dDfFlL]$/, '');
  if (value === 'true') return 'verdadero';
  if (value === 'false') return 'falso';
  if (value === 'null') return 'vacío';
  const member = /^([\w$]+)\.(?:get|is)([A-Z]\w*)\(\)$/.exec(value);
  if (member) return `${words(member[2])} de ${words(member[1])}`;
  const call = /^(?:([\w$.]+)\.)?([\w$]+)\((.*)\)$/.exec(value);
  if (call && call[3].trim()) return `resultado de ${words(call[2])}${call[1] ? ` (${words(call[1])})` : ''}`;
  return words(value.replace(/\(\)$/, ''));
}

function humanizeAtom(atom) {
  let value = atom.trim().replace(/^\((.*)\)$/, '$1').trim();
  let negated = false;
  if (/^!(?!=)/.test(value)) { negated = true; value = value.slice(1).trim().replace(/^\((.*)\)$/, '$1'); }
  let match;
  if ((match = /^(.+?)\.equals(?:IgnoreCase)?\((.+)\)$/.exec(value))) {
    const [left, right] = /^".*"$/.test(match[1]) ? [match[2], match[1]] : [match[1], match[2]];
    return `${term(left)} ${negated ? 'no es' : 'es'} ${term(right)}`;
  }
  if ((match = /^(.+?)\.isEmpty\(\)$/.exec(value))) return `${term(match[1])} ${negated ? 'tiene datos' : 'está vacío'}`;
  if ((match = /^(.+?)\s*(==|!=)\s*null$/.exec(value))) return `${term(match[1])} ${(match[2] === '==') !== negated ? 'no está informado' : 'está informado'}`;
  const operators = { '>=': 'es mayor o igual que', '<=': 'es menor o igual que', '>': 'es mayor que', '<': 'es menor que', '==': 'es igual a', '!=': 'es distinto de' };
  if ((match = /^(.+?)\s*(>=|<=|==|!=|>|<)\s*(.+)$/.exec(value))) return `${negated ? 'no se cumple que ' : ''}${term(match[1])} ${operators[match[2]]} ${term(match[3])}`;
  return `${negated ? 'no se cumple que ' : 'se cumple que '}${term(value)}`;
}

function splitCondition(expression) {
  const atoms = [];
  const joins = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < expression.length; index++) {
    const char = expression[index];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (depth === 0 && (expression.startsWith('&&', index) || expression.startsWith('||', index))) {
      atoms.push(expression.slice(start, index));
      joins.push(expression.startsWith('&&', index) ? ' y ' : ' o ');
      start = index + 2; index++;
    }
  }
  atoms.push(expression.slice(start));
  return { atoms: atoms.map(humanizeAtom), joins };
}

function humanizeStatement(statement) {
  const value = statement.trim().replace(/^\}?\s*/, '').replace(/;\s*\}?$/, '').trim();
  let match;
  if ((match = /^throw\s+new\s+(\w+)\((.*)\)$/.exec(value))) {
    const message = /^"(.*)"/.exec(match[2].trim());
    return { text: `se rechaza la operación (${match[1]})${message ? ` con el mensaje "${message[1]}"` : ''}`, kind: 'Validación' };
  }
  if ((match = /^return\s+(.+)$/.exec(value))) return { text: `se devuelve ${term(match[1])}`, kind: 'Política' };
  if ((match = /^([\w$]+)\.set(Estado|Status|Situacion)\((.+)\)$/i.exec(value))) return { text: `el estado de ${words(match[1])} cambia a ${term(match[3])}`, kind: 'Transición de estado' };
  if ((match = /^[\w$]+\.setAttribute\(\s*"([^"]+)"\s*,\s*(.+)\)$/.exec(value))) return { text: `se informa ${words(match[1])} ${term(match[2])}`, kind: /error/i.test(match[1]) ? 'Validación' : 'Política' };
  if ((match = /^([\w$]+)\.set([A-Z]\w*)\((.+)\)$/.exec(value))) {
    const arithmetic = /[*/+-]/.test(match[3].replace(/"[^"]*"/g, ''));
    return { text: arithmetic ? `se calcula ${words(match[2])} de ${words(match[1])} como ${words(match[3])}` : `${words(match[2])} de ${words(match[1])} toma ${term(match[3])}`, kind: arithmetic ? 'Cálculo' : 'Política' };
  }
  if ((match = /^(?:[\w<>[\]]+\s+)?([\w$.]+)\s*([*/+-]?=)\s*(.+)$/.exec(value))) {
    if (/estado|status|situacion/i.test(match[1])) return { text: `el ${words(match[1])} cambia a ${term(match[3])}`, kind: 'Transición de estado' };
    const arithmetic = match[2] !== '=' || /[*/+-]/.test(match[3].replace(/"[^"]*"/g, ''));
    const expression = match[2] === '=' ? term(match[3]) : `${words(match[1])} ${match[2][0]} ${term(match[3])}`;
    return { text: arithmetic ? `se calcula ${words(match[1])} como ${expression}` : `${words(match[1])} toma ${expression}`, kind: arithmetic ? 'Cálculo' : 'Política' };
  }
  if ((match = /^(?:([\w$.]+)\.)?([\w$]+)\((.*)\)$/.exec(value))) return { text: `se ejecuta ${words(match[2])}${match[1] ? ` (${words(match[1])})` : ''}`, kind: 'Política' };
  return { text: 'Por confirmar', kind: 'Política' };
}

function parseGlossary(text) {
  const glossary = new Map();
  for (const entry of String(text ?? '').split(/[;\n]/)) {
    const match = /^\s*"?([^=:"]+?)"?\s*[=:]\s*(.+?)\s*$/.exec(entry);
    if (match) glossary.set(match[1].trim().toUpperCase(), match[2].trim());
  }
  return glossary;
}

function keyValues(code, glossary, pending) {
  const values = [];
  const seen = new Set();
  const add = (valor, nombre) => {
    if (seen.has(valor)) return;
    seen.add(valor);
    const significado = glossary.get(valor.toUpperCase()) ?? 'Por confirmar';
    if (significado === 'Por confirmar') pending.add(`¿Qué significa el valor "${valor}" (${nombre})?`);
    values.push({ nombre, valor, significado });
  };
  for (const match of code.matchAll(/"([^"\r\n]{1,60})"/g)) if (!/\s{2,}|^\s*$/.test(match[1]) && !/^(?:SELECT|UPDATE|INSERT|DELETE|\{)/i.test(match[1])) add(match[1], 'Código literal');
  for (const match of code.replace(/"[^"]*"/g, '').matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])/g)) if (!['0', '1'].includes(match[1])) add(match[1], 'Valor numérico');
  return values.slice(0, 20);
}

function blockEnd(lines, start) {
  let depth = 0;
  let opened = false;
  for (let index = start; index < lines.length; index++) {
    for (const char of lines[index].replace(/"(?:\\.|[^"\\])*"/g, '""')) {
      if (char === '{') { depth++; opened = true; }
      // Stop at the brace closing the first block so callers can see a following "} else {".
      else if (char === '}' && --depth <= 0 && opened) return index;
    }
    if (!opened && /;\s*$/.test(lines[index])) return index;
  }
  return lines.length - 1;
}

function firstStatement(lines, from, to) {
  for (let index = from; index <= to; index++) {
    const value = lines[index].trim().replace(/^\}\s*else\s*\{?/, '').replace(/^\{/, '').trim();
    if (value && value !== '}' && !value.startsWith('//')) return value;
  }
  return '';
}

export function generateDiscovery(context) {
  const method = context?.metodo ?? {};
  const source = String(method.fragmento ?? '').replace(/\r\n?/g, '\n');
  const lines = source.split('\n');
  const glossary = parseGlossary(context?.glosario);
  const pending = new Set();
  const rules = [];
  const modulo = words(String(method.clase ?? 'Componente').replace(/(?:Servlet|Action|Service|ServiceImpl|DAO|Dao|Bean)$/, '')) || 'componente';
  const unique = fragment => source.indexOf(fragment) !== -1 && source.indexOf(fragment) === source.lastIndexOf(fragment);
  const fragmentOf = (start, end) => lines.slice(start, Math.min(end, start + 9) + 1).join('\n');

  for (let index = 0; index < lines.length && rules.length < 40; index++) {
    const line = lines[index];
    const ifMatch = /\bif\s*\(/.exec(line);
    if (ifMatch) {
      let joined = line.slice(ifMatch.index + ifMatch[0].length);
      let lineEnd = index;
      let depth = 1;
      let condition = '';
      for (;;) {
        for (let position = 0; position < joined.length; position++) {
          if (joined[position] === '(') depth++;
          else if (joined[position] === ')' && --depth === 0) { condition += joined.slice(0, position); joined = joined.slice(position + 1); break; }
        }
        if (depth === 0 || lineEnd + 1 >= lines.length || lineEnd - index >= 10) break;
        condition += joined + ' '; joined = lines[++lineEnd].trim();
      }
      condition = condition.replace(/\s+/g, ' ').trim();
      const end = blockEnd(lines, index);
      const inline = joined.trim().replace(/^\{/, '').trim();
      const result = humanizeStatement(inline && inline !== '}' ? inline : firstStatement(lines, lineEnd + 1, end));
      let alternative = null;
      let last = end;
      const elseLine = /\}\s*else\b/.test(lines[end]) ? end : /^\s*else\b/.test(lines[end + 1] ?? '') ? end + 1 : -1;
      if (elseLine !== -1) {
        if (/else\s+if\s*\(/.test(lines[elseLine])) alternative = `se evalúa la siguiente condición (línea ${Number(method.linea ?? 1) + elseLine})`;
        else {
          last = blockEnd(lines, elseLine);
          const inlineElse = lines[elseLine].replace(/^.*\belse\b\s*\{?/, '').trim();
          alternative = humanizeStatement(inlineElse && inlineElse !== '}' ? inlineElse : firstStatement(lines, elseLine + 1, last)).text;
        }
      }
      const fragment = fragmentOf(index, last);
      if (!condition || !unique(fragment)) continue;
      const { atoms, joins } = splitCondition(condition);
      const sentence = atoms.map((atom, position) => position ? joins[position - 1] + atom : atom).join('');
      const values = keyValues(condition, glossary, pending);
      const unresolved = values.some(item => item.significado === 'Por confirmar') || result.text === 'Por confirmar';
      rules.push({
        modulo, nombre: `${result.kind === 'Validación' ? 'Validar' : 'Regla'}: ${atoms[0]}`.slice(0, 120),
        descripcion: `Si ${sentence}, entonces ${result.text}${alternative ? `; en caso contrario, ${alternative}` : ''}.`,
        tipo: result.kind, condiciones: atoms.slice(0, 20), resultado: result.text, alternativa: alternative,
        valores_clave: values, fragmento_codigo: fragment, dependencias: [],
        confianza: unresolved ? 'Baja' : values.length ? 'Alta' : 'Media',
        observaciones: /^\s*(?:true|false)\s*$/.test(condition) ? 'Condición constante: una de las ramas nunca se ejecuta.' : null
      });
      continue;
    }
    const ternary = /([\w$.]+)\s*=\s*([^=?;][^?;]*)\?\s*([^:;]+):\s*([^;]+);/.exec(line);
    if (ternary && unique(line)) {
      const { atoms, joins } = splitCondition(ternary[2].trim());
      const sentence = atoms.map((atom, position) => position ? joins[position - 1] + atom : atom).join('');
      const values = keyValues(line, glossary, pending);
      rules.push({
        modulo, nombre: `Cálculo de ${words(ternary[1])}`, descripcion: `Si ${sentence}, entonces ${words(ternary[1])} toma ${term(ternary[3])}; en caso contrario, toma ${term(ternary[4])}.`,
        tipo: 'Cálculo', condiciones: atoms, resultado: `${words(ternary[1])} = ${term(ternary[3])}`, alternativa: `${words(ternary[1])} = ${term(ternary[4])}`,
        valores_clave: values, fragmento_codigo: line, dependencias: [],
        confianza: values.some(item => item.significado === 'Por confirmar') ? 'Baja' : 'Media', observaciones: null
      });
      continue;
    }
    const switchMatch = /\bswitch\s*\((.+)\)/.exec(line);
    if (switchMatch) {
      const end = blockEnd(lines, index);
      const fragment = fragmentOf(index, end);
      if (!unique(fragment)) continue;
      const subject = term(switchMatch[1]);
      const branches = [];
      for (let position = index + 1; position < end; position++) {
        const label = /^\s*(?:case\s+([^:]+)|(default))\s*:\s*(.*)$/.exec(lines[position]);
        if (label) branches.push({ value: label[1]?.trim() ?? null, effect: humanizeStatement(label[3].trim() || firstStatement(lines, position + 1, end)) });
      }
      const cases = branches.filter(branch => branch.value !== null);
      const fallback = branches.find(branch => branch.value === null);
      const described = cases.map((branch, position) => `${position ? 'si es' : `Si ${subject} es`} ${term(branch.value)}, entonces ${branch.effect.text}`).join('; ');
      rules.push({
        modulo, nombre: `Decisión según ${subject}`,
        descripcion: `${described || `Si ${subject} coincide con un caso, entonces se aplica su tratamiento`}${fallback ? `; en caso contrario, ${fallback.effect.text}` : ''}.`,
        tipo: branches.some(branch => branch.effect.kind === 'Transición de estado') ? 'Transición de estado' : 'Política',
        condiciones: cases.map(branch => `${subject} es ${term(branch.value)}`).slice(0, 20), resultado: cases.map(branch => branch.effect.text).join('; ') || 'Por confirmar', alternativa: fallback?.effect.text ?? null,
        valores_clave: keyValues(lines.slice(index, end + 1).join(' '), glossary, pending), fragmento_codigo: fragment, dependencias: [], confianza: 'Media',
        observaciones: end - index > 9 ? 'El switch supera 10 líneas; el fragmento muestra solo el inicio.' : null
      });
      continue;
    }
    const sql = /"\s*((?:SELECT|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\b[^"]*|\{\s*call\s+[^"]*)"/i.exec(line);
    if (sql) {
      let end = index;
      let statement = sql[1];
      while (end + 1 < lines.length && end - index < 9 && /^\s*\+\s*"/.test(lines[end + 1])) statement += ' ' + /"([^"]*)"/.exec(lines[++end])[1];
      const fragment = fragmentOf(index, end);
      if (!unique(fragment)) continue;
      statement = statement.replace(/\s+/g, ' ').trim();
      const procedure = /\{\s*call\s+([\w.$]+)/i.exec(statement);
      const tables = [...statement.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+([\w.$]+)/gi)].map(found => found[1]);
      if (!procedure && !tables.length) {
        // e.g. "{call " + sp + "(?)}": the procedure name comes from a variable, usually a properties key.
        pending.add(`La llamada a procedimiento de la línea ${Number(method.linea ?? 1) + index} usa un nombre dinámico; revisar la clave de configuración que lo define.`);
        continue;
      }
      const where = /\bWHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+GROUP\s+BY|$)/i.exec(statement)?.[1];
      const dependencies = procedure ? [`Procedimiento almacenado ${procedure[1]}`] : tables.map(table => `Tabla ${table}`);
      for (const dependency of dependencies) pending.add(`Revisar la definición de ${dependency} (no incluida en el análisis).`);
      rules.push({
        modulo, nombre: procedure ? `Invocación de ${procedure[1]}` : `Acceso a ${tables[0] ?? 'datos'}`,
        descripcion: procedure
          ? `Si el flujo llega a este punto, entonces se ejecuta el procedimiento ${procedure[1]}; su lógica interna está fuera del código analizado.`
          : `Si se ${/^SELECT/i.test(statement) ? 'consulta' : 'modifica'} ${tables.join(', ') || 'la tabla'}${where ? `, entonces solo se consideran los registros donde ${where.replace(/'([^']*)'/g, '"$1"')}` : ', entonces se afectan todos los registros indicados'}.`,
        tipo: procedure ? 'Política' : 'Restricción', condiciones: where ? where.split(/\s+AND\s+/i).map(item => item.replace(/'([^']*)'/g, '"$1"')).slice(0, 20) : ['Sin filtro explícito'],
        resultado: procedure ? `Ejecución de ${procedure[1]}` : 'Conjunto de registros filtrado', alternativa: null,
        valores_clave: keyValues(statement.replace(/'([^']*)'/g, '"$1"'), glossary, pending), fragmento_codigo: fragment,
        dependencias: dependencies, confianza: procedure ? 'Baja' : 'Media',
        observaciones: procedure ? 'La regla real depende del procedimiento almacenado; requiere revisar su código.' : null
      });
    }
  }

  const name = String(method.nombre ?? '');
  const selfCall = name && new RegExp(`(?:^|[^\\w.])(?:this\\.)?${name}\\s*\\(`).test(lines.slice(1).join('\n'));
  if (selfCall && !/\bif\s*\(|\?|&&|\|\||\bwhile\b|\bfor\b/.test(source)) pending.add(`${method.clase}.${name} se invoca a sí mismo sin condición de salida: confirmar si es un defecto.`);
  for (const call of Array.isArray(method.llamadas) ? method.llamadas : []) {
    if (call?.resolucion === 'UNRESOLVED' && call.nombre && !/^(?:(?:get|set|is)[A-Z]\w*|equals\w*|isEmpty|length|size|trim|toString|valueOf)$/.test(call.nombre)) pending.add(`La llamada ${call.receptor ? `${call.receptor}.` : ''}${call.nombre}() no se resolvió con los archivos disponibles; revisar su implementación.`);
  }
  if (!rules.length) pending.add('No se identificaron reglas de negocio en este método; revisar los métodos que lo invocan o a los que llama.');
  const kinds = [...new Set(rules.map(rule => rule.tipo.toLowerCase()))];
  return {
    resumen: `${MOCK_NOTICE}. El método ${method.clase ?? ''}.${name} (${method.archivo ?? 'archivo'}, línea ${method.linea ?? '?'}) ${rules.length
      ? `contiene ${rules.length} regla(s) candidata(s) de tipo ${kinds.join(', ')}.`
      : 'no contiene condiciones, cálculos ni accesos a datos reconocibles como reglas de negocio.'} Las descripciones se generaron con patrones locales y requieren validación con negocio.`,
    reglas: rules,
    pendientes: [...pending].slice(0, 40)
  };
}

export function generateAnswer(question, context) {
  const lines = [`**${MOCK_NOTICE}.** Respuesta generada localmente con el contexto recibido; no proviene de un modelo de IA.`, '', '## 1. Resumen'];
  const pending = [];
  if (context?.rule) {
    const rule = context.rule;
    lines.push(`La regla **${rule.ruleName ?? rule.ruleId}** se ubica en \`${rule.path}\` (${rule.location ?? 'ubicación no indicada'}).`,
      `Condición observada: \`${rule.condition || 'Por confirmar'}\`. El significado de negocio está por confirmar con el responsable funcional.`);
    pending.push('Confirmar qué decisión de negocio representa la condición.', 'Validar si existen otras reglas que dependan de esta.');
  } else if (Array.isArray(context?.nodes)) {
    lines.push(`El flujo parte de \`${context.entry}\` y alcanza ${context.nodes.length} método(s):`, '',
      ...context.nodes.map(node => `- ${'  '.repeat(node.depth ?? 0)}\`${node.method?.className}.${node.method?.name}\` (${node.method?.path}:${node.method?.startLine})`));
    const unresolved = context.nodes.flatMap(node => (node.method?.calls ?? []).filter(call => call.resolution === 'UNRESOLVED').map(call => `${node.method.className}.${node.method.name} → ${call.name}`));
    if (unresolved.length) pending.push(...unresolved.slice(0, 10).map(item => `Llamada sin resolver: ${item}.`));
  } else {
    const included = Array.isArray(context?.included) ? context.included : [];
    const byTitle = new Map();
    for (const item of included) byTitle.set(item.title ?? item.ruleName ?? 'Hallazgo', (byTitle.get(item.title ?? item.ruleName ?? 'Hallazgo') ?? 0) + 1);
    lines.push(`Pregunta: "${String(question).slice(0, 300)}".`,
      `Proyecto ${context?.project?.name ?? context?.project ?? 'seleccionado'}${context?.module ? `, módulo **${context.module}**` : ''}: ${context?.totalFindings ?? included.length} hallazgo(s), de los que se recibieron ${included.length}.`);
    if (context?.coverage) lines.push(`Cobertura: ${context.coverage.analyzed} archivo(s) analizados, ${context.coverage.skipped} omitidos y ${context.coverage.errors} con error.`);
    if (byTitle.size) lines.push('', ...[...byTitle].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([title, count]) => `- ${title}: ${count}`));
    const high = included.filter(item => item.severity === 'Alta');
    if (high.length) pending.push(...high.slice(0, 5).map(item => `Revisar con prioridad: ${item.title} en ${item.path}:${item.line}.`));
    if (Array.isArray(context?.approvedRules) && context.approvedRules.length) lines.push('', `Hay ${context.approvedRules.length} regla(s) aprobada(s) que deben conservarse en la migración${context.targetTechnology ? ` hacia ${context.targetTechnology}` : ''}.`);
    else pending.push('Aprobar reglas en Decisiones antes de proponer la arquitectura objetivo.');
  }
  lines.push('', '## 2. Siguientes pasos', '- Validar con negocio los significados marcados como "Por confirmar".', '- Usar "Generar análisis de negocio" por método para obtener reglas estructuradas.',
    '', '## 3. Pendientes', ...(pending.length ? pending : ['Sin pendientes adicionales con el contexto recibido.']).map(item => `- ${item}`));
  return lines.join('\n');
}

/** Sustituto de fetch con la misma forma de respuesta que la API compatible con OpenAI de Huawei MaaS. */
export async function mockFetch(_url, options) {
  const payload = JSON.parse(options.body);
  const user = payload.messages.find(message => message.role === 'user')?.content ?? '';
  let content = 'OK';
  if (payload.messages.length > 1) {
    const { question, context } = JSON.parse(user);
    content = String(question).includes(DISCOVERY_MARKER) ? JSON.stringify(generateDiscovery(context)) : generateAnswer(question, context);
  }
  return Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }], usage: { total_tokens: 0 } });
}
