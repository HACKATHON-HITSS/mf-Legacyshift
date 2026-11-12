import { redactEvidence } from './project-findings';

export type FlowStep = { label: string; line: number };
export type ProcessFlow = {
  id: string; path: string; name: string; startLine: number; endLine: number;
  before: FlowStep[]; decision: FlowStep | null; yes: FlowStep[]; no: FlowStep[]; after: FlowStep[];
};

// Conservative subset: one explicit PL/SQL BEGIN/END block, at most one IF/ELSE,
// and single-line statements. Unsupported control flow is not connected or guessed.
export function extractProcessFlows(text: string, path: string, language: string): ProcessFlow[] {
  if (language !== 'SQL / PL/SQL') return [];
  const lines = text.split(/\r\n|\r|\n/);
  const flows: ProcessFlow[] = [];
  let start = -1;
  let before: FlowStep[] = [], yes: FlowStep[] = [], no: FlowStep[] = [], after: FlowStep[] = [];
  let decision: FlowStep | null = null;
  let mode: 'before' | 'yes' | 'no' | 'after' = 'before';
  let invalid = false;
  let component = 'Bloque PL/SQL';
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    const trimmed = raw.replace(/--.*$/, '').trim();
    if (!trimmed || /^--/.test(raw)) continue;
    if (start < 0) {
      const declaration = /\b(procedure|function)\s+([\w.$#]+)/i.exec(trimmed);
      if (declaration) component = `${declaration[1].toUpperCase()} ${declaration[2]}`;
      if (/^BEGIN\s*$/i.test(trimmed)) {
        start = i; before = []; yes = []; no = []; after = []; decision = null; mode = 'before'; invalid = false;
      }
      continue;
    }
    if (/^END\s*;\s*$/i.test(trimmed)) {
      if (!invalid && mode !== 'yes' && mode !== 'no' && (before.length || decision || after.length)) {
        flows.push({ id: `${path}:${start + 1}:${i + 1}`, path, name: component, startLine: start + 1, endLine: i + 1, before, decision, yes, no, after });
      }
      start = -1;
      continue;
    }
    const condition = /^IF\s+(.+?)\s+THEN\s*$/i.exec(trimmed);
    if (condition) {
      if (decision || mode !== 'before') invalid = true;
      else { decision = { label: redactEvidence(condition[1]), line: i + 1 }; mode = 'yes'; }
      continue;
    }
    if (/^ELSE\s*$/i.test(trimmed)) { if (mode !== 'yes') invalid = true; else mode = 'no'; continue; }
    if (/^END\s+IF\s*;\s*$/i.test(trimmed)) { if (mode !== 'yes' && mode !== 'no') invalid = true; else mode = 'after'; continue; }
    // Do not model control transfers, nested blocks, comments or multiline statements.
    if (/^(?:ELSIF|CASE|WHEN|LOOP|FOR|WHILE|BEGIN|EXCEPTION|RETURN|RAISE|EXIT|CONTINUE|GOTO|\/\*|\*)\b/i.test(trimmed)
      || !/;\s*$/.test(trimmed) || (trimmed.match(/;/g)?.length ?? 0) !== 1) { invalid = true; continue; }
    const step = { label: redactEvidence(trimmed), line: i + 1 };
    ({ before, yes, no, after })[mode].push(step);
  }
  return flows;
}
