import { describe, expect, it } from 'vitest';
import { parseJavaFile, reachableMethods, recursionWithoutExit, resolveJavaAnalysis } from './java-analysis';

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
  it('resuelve llamadas con this. hacia métodos y campos de la propia clase', () => {
    const text = 'class A { B b; void go(int x) { this.run(x); this.b.ping(); } void run(int x) {} }\nclass B { void ping() {} }';
    const result = resolveJavaAnalysis([parseJavaFile(text, 'A.java')]);
    const calls = result.methods.find(item => item.name === 'go')!.calls;
    expect(calls.map(call => [call.name, call.receiver, call.resolution])).toEqual([['run', 'this', 'INFERRED'], ['ping', 'this.b', 'INFERRED']]);
    expect(result.methods.find(item => item.id === calls[1].target)?.className).toBe('B');
  });
  it('detecta recursión directa y mutua sin condición de salida', () => {
    const text = 'class A { void self(int x) { self(x); } void ping() { this.pong(); } void pong() { ping(); } void ok() {} }';
    const cycles = recursionWithoutExit(resolveJavaAnalysis([parseJavaFile(text, 'A.java')]));
    expect(cycles.map(cycle => cycle.methods.map(method => method.name).sort())).toEqual([['self'], ['ping', 'pong']]);
  });
  it('no marca recursión con caso base por if, ternario, bucle o cortocircuito', () => {
    const text = [
      'class A {',
      ' int fact(int n) { if (n <= 1) return 1; return n * fact(n - 1); }',
      ' int tern(int n) { return n <= 1 ? 1 : n * tern(n - 1); }',
      ' boolean any(Node n) { return n != null && any(n.next); }',
      ' void loop(int n) { while (n > 0) { loop(n - 1); n--; } }',
      ' void a(int n) { if (n > 0) b(n - 1); } void b(int n) { a(n); }',
      '}'
    ].join('\n');
    expect(recursionWithoutExit(resolveJavaAnalysis([parseJavaFile(text, 'A.java')]))).toEqual([]);
  });
});
