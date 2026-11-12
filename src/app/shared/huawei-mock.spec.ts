import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeLocalProject } from '../features/codigo-fuente/proyecto/local-project-analyzer';
import { JavaMethod } from '../features/codigo-fuente/proyecto/java-analysis';
import { parseBusinessDiscovery } from './business-discovery';
import { generateDiscovery } from '../../../server/huawei-mock.mjs';

const root = join(process.cwd(), 'samples', 'legacy-telco');
const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]);
function sampleFile(path: string): File {
  const text = readFileSync(path, 'utf8');
  const file = new File([text], path.split(/[\\/]/).pop() as string);
  Object.defineProperty(file, 'webkitRelativePath', { value: `legacy-telco/${relative(root, path).split(/[\\/]/).join('/')}` });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(text).buffer });
  return file;
}
// Same context the "Generar análisis de negocio" button sends.
const discover = (method: JavaMethod, glosario = '') => parseBusinessDiscovery(JSON.stringify(generateDiscovery({
  metodo: { archivo: method.path, clase: method.className, nombre: method.name, linea: method.startLine, fragmento: method.evidence.snippet,
    llamadas: method.calls.map(call => ({ nombre: call.name, receptor: call.receiver, resolucion: call.resolution })) },
  glosario
})), method);

describe('Mock de Huawei para el análisis de negocio', async () => {
  const report = await analyzeLocalProject(walk(root).map(sampleFile), () => undefined);
  const glossary = readFileSync(join(root, 'GLOSARIO.txt'), 'utf8');
  const method = (name: string) => report.java.methods.find(item => item.name === name)!;

  it('genera reglas cuyo fragmento supera la verificación del frontend en todos los métodos del ejemplo', () => {
    expect(report.java.errors).toEqual([]);
    for (const item of report.java.methods) {
      const result = discover(item, glossary);
      expect(result.discarded, `${item.className}.${item.name}`).toBe(0);
      expect(result.resumen).toContain('Datos simulados');
    }
  });
  it('redacta validaciones en lenguaje de negocio y resuelve códigos con el glosario', () => {
    const rules = discover(method('validarCliente'), glossary).reglas;
    expect(rules).toHaveLength(4);
    expect(rules[2]).toMatchObject({ tipo: 'Validación', confianza: 'Alta', origen: { metodo: 'validarCliente', linea: 15 } });
    expect(rules[2].descripcion).toBe('Si tipo plan es "POS" y score crediticio de cliente es menor que 450, entonces se rechaza la operación (BusinessException) con el mensaje "Score insuficiente para plan postpago".');
    expect(rules[2].valores_clave).toContainEqual({ nombre: 'Código literal', valor: 'POS', significado: 'Postpago' });
  });
  it('marca como Por confirmar los valores sin glosario y los lleva a pendientes', () => {
    const result = discover(method('validarCliente'));
    expect(result.reglas[1].valores_clave).toContainEqual({ nombre: 'Valor numérico', valor: '18', significado: 'Por confirmar' });
    expect(result.reglas[1].confianza).toBe('Baja');
    expect(result.pendientes).toContain('¿Qué significa el valor "18" (Valor numérico)?');
  });
  it('incluye la alternativa del else, transiciones de estado del switch y SQL con sus dependencias', () => {
    expect(discover(method('doPost'), glossary).reglas[1].alternativa).toBe('se ejecuta activar linea (servicio)');
    const state = discover(method('actualizarEstado'), glossary).reglas[0];
    expect(state.tipo).toBe('Transición de estado');
    expect(state.descripcion).toContain('Si codigo respuesta de solicitud es 0, entonces el estado de solicitud cambia a "ACT"; si es 98');
    expect(state.alternativa).toBe('el estado de solicitud cambia a "REC"');
    const sql = discover(method('contarLineasActivas'), glossary).reglas[0];
    expect(sql).toMatchObject({ tipo: 'Restricción', dependencias: ['Tabla T_LINEA'] });
    expect(discover(method('activar'), glossary).reglas[0].dependencias).toEqual(['Procedimiento almacenado PKG_LINEAS.SP_ACTIVAR_LINEA']);
  });
});
