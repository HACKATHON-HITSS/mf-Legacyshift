import { describe, expect, it } from 'vitest';
import { parseJavaFile } from '../features/codigo-fuente/proyecto/java-analysis';
import { parseBusinessDiscovery } from './business-discovery';

const source = `class Pago {
  public void ejecutar(int deuda) {
    if (deuda > 0) {
      permitirPago = true;
    }
  }
}`;
const method = parseJavaFile(source, 'Pago.java').methods[0];
const rule = {
  modulo: 'Pagos', nombre: 'Habilitar pago', descripcion: 'Si existe deuda, se habilita el pago.', tipo: 'Validación',
  condiciones: ['La deuda es mayor que cero'], resultado: 'Habilitar pago', alternativa: null,
  valores_clave: [], fragmento_codigo: 'if (deuda > 0) {\n      permitirPago = true;\n    }',
  dependencias: [], confianza: 'Media', observaciones: null
};

describe('Respuesta estructurada de reglas de negocio', () => {
  it('verifica el fragmento y calcula la ubicación real desde la evidencia', () => {
    const result = parseBusinessDiscovery(JSON.stringify({ resumen: 'Evalúa pagos.', reglas: [rule], pendientes: ['Confirmar deuda.'] }), method);
    expect(result.reglas[0]).toMatchObject({ origen: { archivo: 'Pago.java', clase: 'Pago', metodo: 'ejecutar', linea: 3 }, tipo: 'Validación' });
    expect(result.discarded).toBe(0);
    expect(result.pendientes).toContain('Confirmar deuda.');
  });
  it('omite fragmentos inventados y mayores de diez líneas', () => {
    const result = parseBusinessDiscovery(JSON.stringify({ resumen: 'Evaluación.', reglas: [{ ...rule, fragmento_codigo: 'no existe' }], pendientes: [] }), method);
    expect(result.reglas).toEqual([]); expect(result.discarded).toBe(1);
  });
  it('rechaza JSON inválido y respuestas fuera de esquema', () => {
    expect(() => parseBusinessDiscovery('no es json', method)).toThrow(/JSON válido/);
    expect(() => parseBusinessDiscovery(JSON.stringify({ resumen: 'x', reglas: [{ ...rule, confianza: 'Segura' }], pendientes: [] }), method)).toThrow(/estructura/);
  });
  it('rechaza evidencia repetida que no permite ubicar la regla de manera única', () => {
    const other = parseJavaFile('class X { void a() { foo(); foo(); } }', 'X.java').methods[0];
    const result = parseBusinessDiscovery(JSON.stringify({ resumen: 'x', reglas: [{ ...rule, fragmento_codigo: 'foo();' }], pendientes: [] }), other);
    expect(result.reglas).toEqual([]); expect(result.discarded).toBe(1);
  });
});
