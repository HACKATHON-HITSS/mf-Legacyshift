import { describe, expect, it } from 'vitest';
import { parseJavaFile, reachableMethods, resolveJavaAnalysis } from './java-analysis';

const servlet = `package demo;
public class ClienteServlet extends HttpServlet {
 private ClienteService service;
 public void doGet(int id) {
   if (id > 0) { service.validar(id); } else { service.error(); }
   service.desconocido();
 }
}`;
const service = `package demo;
public class ClienteService {
 private ClienteDAO dao;
 public void validar(int id) { dao.consultar(id); }
 public void error() { throw new IllegalArgumentException(); }
}`;
const dao = `package demo;
public class ClienteDAO {
 public void consultar(int id) { this.consultar(id); }
}`;

describe('Analizador Java estructural', () => {
  it('extrae clases, métodos, condiciones y llamadas entre archivos con ciclos acotados', () => {
    const analysis = resolveJavaAnalysis([parseJavaFile(servlet, 'ClienteServlet.java'), parseJavaFile(service, 'ClienteService.java'), parseJavaFile(dao, 'ClienteDAO.java')]);
    expect(analysis.errors).toEqual([]);
    expect(analysis.components.map(value => value.name)).toEqual(['ClienteServlet', 'ClienteService', 'ClienteDAO']);
    const entry = analysis.methods.find(value => value.name === 'doGet')!;
    expect(entry.entryPoint).toBe(true);
    expect(entry.conditions.some(value => value.kind === 'ifStatement' && value.expression === 'id > 0')).toBe(true);
    const call = entry.calls.find(value => value.name === 'validar')!;
    expect(call.resolution).toBe('INFERRED');
    expect(analysis.methods.find(method => method.id === call.target)?.name).toBe('validar');
    expect(entry.calls.find(value => value.name === 'desconocido')?.resolution).toBe('UNRESOLVED');
    expect(reachableMethods(analysis, entry.id).map(item => item.method.name)).toEqual(['doGet', 'validar', 'error', 'consultar']);
    expect(analysis.methods.find(value => value.name === 'error')?.conditions.some(value => value.kind === 'throwStatement')).toBe(true);
  });
  it('conserva errores sintácticos y no inventa clases ni destinos', () => {
    const result = parseJavaFile('public class {', 'broken.java');
    expect(result.errors).toHaveLength(1);
    expect(result.components).toEqual([]);
  });
  it('mantiene las sobrecargas ambiguas sin resolver', () => {
    const text = 'class A { void go() { run(1); } void run(int x) {} void run(String x) {} }';
    const result = resolveJavaAnalysis([parseJavaFile(text, 'A.java')]);
    expect(result.methods.find(item => item.name === 'go')?.calls[0]).toMatchObject({ resolution: 'UNRESOLVED', target: null });
  });
});
