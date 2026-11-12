import { JavaAnalysis, JavaMethod } from './java-analysis';

export type ConfiguredProcedure = { key: string; procedure: string; path: string; line: number };
export type ProcedureUsageKind = 'Clave literal' | 'Constante' | 'Uso de constante' | 'Placeholder ${...}' | 'Nombre literal del SP';
export type ProcedureUsage = {
  path: string; line: number; kind: ProcedureUsageKind; evidence: string;
  method: string | null; invokes: boolean; constant: string | null;
};
export type ProcedureStatus = 'INVOCADO' | 'LEIDO_SIN_LLAMADA' | 'SIN_REFERENCIAS';
export type ProcedureAnalysis = ConfiguredProcedure & { status: ProcedureStatus; usages: ProcedureUsage[] };
export type ProcedureSource = { path: string; language: string; text: string };

const PROCEDURE_VALUE = /^[A-Za-z_][\w$#]*(?:\.[A-Za-z_][\w$#]*){0,2}$/;
const PROCEDURE_KEY = /(?:^|[._-])(?:sp|usp|proc|procedure|procedimiento|prc|storedprocedure)(?:[._-]|$)/i;
const PROCEDURE_NAME = /(?:^|\.)(?:USP|SP|PRC|PROC|PR|PKG)_/i;
const JDBC_CALL = /\bprepareCall\s*\(|\bCallableStatement\b|\{\s*\?\s*=\s*call\b|\{\s*call\b|\bStoredProcedure\b|\bSimpleJdbcCall\b|\bregisterOutParameter\s*\(|\bwithProcedureName\s*\(/;

function unescapeProperty(value: string): string {
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))).replace(/\\(.)/g, '$1');
}

/** Entries of a .properties file whose value looks like a stored procedure name. */
export function extractConfiguredProcedures(text: string, path: string): ConfiguredProcedure[] {
  const result: ConfiguredProcedure[] = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (let index = 0; index < lines.length; index++) {
    const start = index;
    let logical = lines[index].replace(/^\s+/, '');
    // A trailing odd number of backslashes continues the entry on the next line.
    while (/(?:^|[^\\])(?:\\\\)*\\$/.test(logical) && index + 1 < lines.length) logical = logical.slice(0, -1) + lines[++index].replace(/^\s+/, '');
    if (!logical || /^[#!]/.test(logical)) continue;
    const match = /^((?:\\.|[^\s=:\\])+)\s*[=:\s]\s*(.*)$/.exec(logical);
    if (!match) continue;
    const key = unescapeProperty(match[1]);
    const value = unescapeProperty(match[2]).trim();
    if (!PROCEDURE_VALUE.test(value) || /^\d/.test(value)) continue;
    // Without an SP-like prefix the value must be qualified (PACKAGE.PROCEDURE), so `sp.usuario=ADMIN` is not reported.
    if (PROCEDURE_NAME.test(value) || (PROCEDURE_KEY.test(key) && value.includes('.'))) result.push({ key, procedure: value, path, line: start + 1 });
  }
  return result;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Keep line numbers while hiding comments, so commented-out code is not reported as a usage.
function maskComments(text: string, language: string): string {
  if (language === 'Java') {
    let result = '';
    let state: 'code' | 'string' | 'char' | 'line' | 'block' = 'code';
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      const next = text[index + 1];
      if (state === 'code') {
        if (char === '/' && next === '/') { state = 'line'; result += '  '; index++; continue; }
        if (char === '/' && next === '*') { state = 'block'; result += '  '; index++; continue; }
        if (char === '"') state = 'string';
        else if (char === "'") state = 'char';
        result += char;
      } else if (state === 'string' || state === 'char') {
        if (char === '\\') { result += char + (next ?? ''); index++; continue; }
        if ((state === 'string' && char === '"') || (state === 'char' && char === "'") || char === '\n') state = 'code';
        result += char;
      } else if (state === 'line') {
        if (char === '\n' || char === '\r') { state = 'code'; result += char; } else result += ' ';
      } else {
        if (char === '*' && next === '/') { state = 'code'; result += '  '; index++; continue; }
        result += char === '\n' || char === '\r' ? char : ' ';
      }
    }
    return result;
  }
  if (['XML', 'JDeveloper'].includes(language)) return text.replace(/<!--[\s\S]*?-->/g, match => match.replace(/[^\r\n]/g, ' '));
  return text;
}

function enclosingMethod(java: JavaAnalysis, path: string, line: number): JavaMethod | null {
  return java.methods.filter(method => method.path === path && method.startLine <= line && line <= method.endLine)
    .sort((a, b) => b.startLine - a.startLine)[0] ?? null;
}

/**
 * Finds where each configured procedure is referenced (key literal, constants holding the key, `${key}` placeholders or the
 * literal procedure name) and whether the enclosing Java method performs a JDBC/Spring procedure call.
 */
export function analyzeConfiguredProcedures(procedures: ConfiguredProcedure[], sources: ProcedureSource[], java: JavaAnalysis): ProcedureAnalysis[] {
  const prepared = sources.filter(source => source.language !== 'Properties').map(source => {
    const lines = source.text.split(/\r\n|\r|\n/);
    return { ...source, lines, masked: maskComments(source.text, source.language).split(/\r\n|\r|\n/) };
  });
  const methodInvokes = (path: string, method: JavaMethod) => {
    const source = prepared.find(item => item.path === path);
    return !!source && JDBC_CALL.test(source.masked.slice(method.startLine - 1, method.endLine).join('\n'));
  };
  return procedures.map(procedure => {
    const usages: ProcedureUsage[] = [];
    const constants: string[] = [];
    const keyLiteral = new RegExp(`"${escapeRegExp(procedure.key)}"`);
    const placeholder = new RegExp(`\\$\\{\\s*${escapeRegExp(procedure.key)}\\s*(?::[^}]*)?\\}`);
    const name = new RegExp(`(?<![\\w$#.])${escapeRegExp(procedure.procedure)}(?![\\w$#])`, 'i');
    const record = (source: (typeof prepared)[number], index: number, kind: ProcedureUsageKind, constant: string | null) => {
      const method = source.language === 'Java' ? enclosingMethod(java, source.path, index + 1) : null;
      usages.push({ path: source.path, line: index + 1, kind, evidence: source.lines[index].trim().slice(0, 300),
        method: method ? `${method.className}.${method.name}` : null, invokes: !!method && methodInvokes(source.path, method), constant });
    };
    for (const source of prepared) for (const [index, line] of source.masked.entries()) {
      if (source.language === 'Java' && keyLiteral.test(line)) {
        const declared = new RegExp(`\\b([A-Za-z_$][\\w$]*)\\s*=\\s*"${escapeRegExp(procedure.key)}"`).exec(line);
        const constant = declared && !enclosingMethod(java, source.path, index + 1) ? declared[1] : null;
        if (constant) constants.push(constant);
        record(source, index, constant ? 'Constante' : 'Clave literal', constant);
      } else if (placeholder.test(line)) record(source, index, 'Placeholder ${...}', null);
      else if (name.test(line)) record(source, index, 'Nombre literal del SP', null);
    }
    for (const constant of constants) {
      const usage = new RegExp(`(?<![\\w$])${escapeRegExp(constant)}(?![\\w$])`);
      for (const source of prepared.filter(item => item.language === 'Java')) for (const [index, line] of source.masked.entries()) {
        if (usage.test(line) && !usages.some(item => item.path === source.path && item.line === index + 1)) record(source, index, 'Uso de constante', constant);
      }
    }
    usages.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
    const status: ProcedureStatus = usages.some(usage => usage.invokes) ? 'INVOCADO' : usages.length ? 'LEIDO_SIN_LLAMADA' : 'SIN_REFERENCIAS';
    return { ...procedure, status, usages };
  });
}

export function describeProcedure(item: ProcedureAnalysis): string {
  const invoked = item.usages.filter(usage => usage.invokes);
  if (item.status === 'INVOCADO') return `Invocado en ${[...new Set(invoked.map(usage => `${usage.method} (${usage.path}:${usage.line})`))].join(', ')}`;
  if (item.status === 'LEIDO_SIN_LLAMADA') return `Referenciado en ${item.usages.length} punto(s) sin llamada JDBC en el mismo método: ${item.usages.slice(0, 3).map(usage => `${usage.path}:${usage.line}`).join(', ')}`;
  return 'Sin referencias a la clave ni al nombre en el código analizado';
}
