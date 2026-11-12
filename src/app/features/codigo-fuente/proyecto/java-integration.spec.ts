import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeLocalProject } from './local-project-analyzer';
import { reachableMethods } from './java-analysis';

function fixture(name: string): File {
  const source = readFileSync(join(process.cwd(), 'src', 'app', 'features', 'codigo-fuente', 'proyecto', 'fixtures', 'java', name), 'utf8');
  const file = new File([source], name);
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(source).buffer });
  return file;
}

describe('Análisis Java integrado en el informe', () => {
  it('construye reglas y grafo a partir de archivos Java reales, con evidencia y destinos sin resolver', async () => {
    const report = await analyzeLocalProject(['ClienteServlet.java', 'ClienteService.java', 'ClienteDAO.java'].map(fixture), () => undefined);
    expect(report.java.errors).toEqual([]);
    expect(report.analyzed).toBe(3);
    const entry = report.java.methods.find(method => method.entryPoint)!;
    const reachable = reachableMethods(report.java, entry.id);
    expect(reachable.map(item => item.method.name)).toEqual(['doGet', 'consultar', 'rechazar', 'buscar']);
    expect(entry.calls.find(call => call.name === 'ausente')).toMatchObject({ resolution: 'UNRESOLVED', target: null });
    const rule = report.businessRules.find(item => item.artifactType === 'JAVA')!;
    expect(rule).toMatchObject({ path: 'ClienteServlet.java', startLine: 5, condition: 'id > 0', discoveryMethod: 'Árbol sintáctico Java' });
    expect(rule.snippet).toContain('servicio.consultar(id)');
    const buscar = report.java.methods.find(method => method.name === 'buscar')!;
    expect(buscar.calls[0]).toMatchObject({ name: 'buscar', receiver: 'this', resolution: 'INFERRED', target: buscar.id });
    expect(report.findings.filter(item => item.category === 'deuda-tecnica')).toEqual([
      expect.objectContaining({ path: 'ClienteDAO.java', line: 3, title: 'Recursión sin condición de salida', severity: 'Alta', condition: 'ClienteDAO.buscar se invoca a sí mismo' })
    ]);
  });
});
