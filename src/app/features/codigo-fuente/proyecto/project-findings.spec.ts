import { describe, expect, it } from 'vitest';
import { extractCodeFindings, redactEvidence } from './project-findings';
import { analyzeLocalProject } from './local-project-analyzer';

export function sourceFile(name: string, text: string, path = name): File {
  const file = new File([text], name);
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(text).buffer });
  return file;
}

describe('Code evidence extraction', () => {
  it('builds rule candidates with original file and line across multiline conditions', () => {
    const code = ['public boolean withdraw(int amount) {', '  if (balance < amount &&', '      active) {', '    throw new Error("Not enough balance");', '  }', '  return true;', '}'].join('\n');
    const findings = extractCodeFindings(code, 'app/Account.java', 'Java');
    const rule = findings.find(item => item.category === 'reglas');
    expect(rule).toMatchObject({ path: 'app/Account.java', line: 2, title: 'Regla candidata a validar' });
    expect(rule?.condition).toContain('active');
    expect(rule?.action).toContain('throw');
    expect(rule?.action).not.toContain('Not enough balance');
    expect(findings.some(item => item.category === 'logica' && item.title.includes('withdraw'))).toBe(true);
  });
  it('ignores commented code and syntax inside string literals', () => {
    const code = '/* if (fake) { eval(x); } */\n// if (other) run();\nconst docs = "if (text) eval(text)";\n// TODO review';
    const findings = extractCodeFindings(code, 'example.ts', 'TypeScript');
    expect(findings.filter(item => ['reglas', 'condiciones', 'vulnerabilidades'].includes(item.category))).toEqual([]);
    expect(findings.filter(item => item.category === 'deuda-tecnica')).toHaveLength(1);
  });
  it('reports candidate security sinks without classifying them as confirmed exploits', () => {
    const findings = extractCodeFindings('eval(input);\ncatch (error) {}', 'script.js', 'JavaScript');
    expect(findings.find(item => item.category === 'vulnerabilidades')?.limitation).toContain('no se ha comprobado');
    expect(findings.some(item => item.category === 'deuda-tecnica')).toBe(true);
  });
  it('omits sensitive values from displayed or exported evidence', () => {
    expect(redactEvidence('if (token === "private-value") reject();')).not.toContain('private-value');
    expect(redactEvidence('password = unquoted-secret')).not.toContain('unquoted-secret');
  });
  it('keeps file coverage and inventories alongside the candidate matrix', async () => {
    const report = await analyzeLocalProject([
      sourceFile('Account.java', 'if (amount > limit) { reject(); }', 'demo/services/Account.java'),
      sourceFile('package.json', '{"dependencies":{"example-lib":"1.0"}}', 'demo/package.json'),
      sourceFile('ignored.js', 'if (x) eval(x)', 'demo/node_modules/ignored.js'),
      sourceFile('archive.zip', 'not supported', 'demo/archive.zip')
    ], () => undefined);
    expect(report.analyzed).toBe(2); expect(report.skipped).toBe(2);
    expect(report.findings.filter(item => item.category === 'reglas')).toHaveLength(1);
    expect(report.dependencies[0].name).toBe('example-lib @ 1.0');
    expect(report.files[0].role).toBe('Servicios');
  });
});
