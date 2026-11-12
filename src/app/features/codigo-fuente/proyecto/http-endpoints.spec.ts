import { describe, expect, it } from 'vitest';
import { parseJavaFile, resolveJavaAnalysis } from './java-analysis';
import { HTTP_ENDPOINT_AGENT } from './http-endpoints.agent';
import { analyzeLocalProject } from './local-project-analyzer';

const analyze = (source: string) => HTTP_ENDPOINT_AGENT.analyze(resolveJavaAnalysis([parseJavaFile(source, 'Api.java')]));

describe('Agente de detección HTTP', () => {
  it('combina rutas Spring y distingue todos los verbos explícitos', () => {
    const endpoints = analyze(`@RestController @RequestMapping("/clientes") class Api {
      @GetMapping("/{id}") String obtener(int id) { return servicio.buscar(id); }
      @PostMapping String crear() { return "ok"; }
      @PutMapping("/{id}") void reemplazar(int id) {}
      @PatchMapping("/{id}") void editar(int id) {}
      @DeleteMapping("/{id}") void borrar(int id) {}
      @RequestMapping(path = "/estado", method = {RequestMethod.HEAD, RequestMethod.OPTIONS}) void estado() {}
    }`);
    expect(endpoints.map(item => item.verb)).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
    expect(endpoints[0]).toMatchObject({ route: '/clientes/{id}', input: 'int id', output: 'String', path: 'Api.java', line: 2 });
    expect(endpoints[0].description).toContain('buscar');
    expect(endpoints[1].route).toBe('/clientes');
  });

  it('detecta JAX-RS, múltiples rutas y servlets sin inventar URLs', () => {
    expect(analyze(`@Path("/pagos") class Api { @PATCH @Path("/{id}") void editar(int id) {} }`)[0])
      .toMatchObject({ verb: 'PATCH', route: '/pagos/{id}' });
    expect(analyze(`class Api { @GetMapping({"/a", "/b"}) void listar() {} }`).map(item => item.route)).toEqual(['/a', '/b']);
    expect(analyze(`@WebServlet(urlPatterns = {"/uno", "/dos"}) class Api extends HttpServlet { public void doPost() {} }`).map(item => [item.verb, item.route]))
      .toEqual([['POST', '/uno'], ['POST', '/dos']]);
    expect(analyze(`class Api extends HttpServlet { public void doGet() {} }`)[0])
      .toMatchObject({ verb: 'GET', route: 'Por confirmar' });
  });

  it('no inventa verbos por el nombre del método ni evalúa rutas constantes', () => {
    expect(analyze('class Api { void getClientes() {} @WebMethod void consultar() {} }')).toEqual([]);
    expect(analyze('class Api { @RequestMapping(path = RUTA) void procesar() {} }')[0])
      .toMatchObject({ verb: 'Por confirmar', route: 'Por confirmar' });
    expect(analyze('class Api { @GetMapping(PREFIX + "/clientes") void listar() {} }')[0]?.route).toBe('Por confirmar');
  });

  it('guarda el mapa en el informe durante el análisis del proyecto', async () => {
    const source = 'class Api { @GetMapping("/clientes") String listar() { return "ok"; } }';
    const file = new File([source], 'Api.java');
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(source).buffer });
    const report = await analyzeLocalProject([file], () => undefined);
    expect(report.httpEndpoints).toHaveLength(1);
    expect(report.httpEndpoints?.[0]).toMatchObject({ verb: 'GET', route: '/clientes' });
  });
});
