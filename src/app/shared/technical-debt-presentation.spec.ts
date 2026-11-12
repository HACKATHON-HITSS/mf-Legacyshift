import { describe, expect, it } from 'vitest';
import { CodeFinding } from '../features/codigo-fuente/proyecto/project-findings';
import { presentTechnicalDebt } from './technical-debt-presentation';

const finding: CodeFinding = {
  id: 'debt:1', category: 'deuda-tecnica', title: 'Procedimiento configurado sin invocación directa',
  path: 'src/app.properties', line: 1, condition: 'sp.consultar = PKG.CONSULTAR', action: 'Revisar',
  evidence: 'Referencia sin llamada directa', severity: 'Media', limitation: 'Análisis parcial'
};

describe('Detalle comprensible de pendientes técnicos', () => {
  it('muestra referencias reales sin confundirlas con ejecución confirmada', () => {
    const result = presentTechnicalDebt(finding, [{
      key: 'sp.consultar', procedure: 'PKG.CONSULTAR', path: 'src/app.properties', line: 1, status: 'LEIDO_SIN_LLAMADA',
      usages: [{ path: 'src/Properties.java', line: 13, kind: 'Clave literal', evidence: 'sp.consultar', method: null, invokes: false, constant: null }]
    }]);
    expect(result.references).toEqual([{ path: 'src/Properties.java', fileName: 'Properties.java', line: 13 }]);
    expect(result.confirmed).toContain('1 referencia');
    expect(result.confirmed).toContain('no confirma que se ejecute');
    expect(result.conclusion).toContain('no se puede concluir que deba eliminarse');
    expect(result.decisions).toHaveLength(3);
  });

  it('no inventa referencias si no existe un procedimiento asociado', () => {
    const result = presentTechnicalDebt(finding);
    expect(result.references).toEqual([]);
    expect(result.confirmed).not.toContain('referencias');
    expect(result.missing).toContain('no pudo confirmarlo');
  });
});
