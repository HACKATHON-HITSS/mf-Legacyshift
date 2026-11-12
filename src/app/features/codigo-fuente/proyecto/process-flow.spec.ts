import { describe, expect, it } from 'vitest';
import { extractProcessFlows } from './process-flow';

describe('Reconstrucción de flujo PL/SQL', () => {
  it('conecta pasos, ramas y continuación en el orden observado', () => {
    const text = ['PROCEDURE procesar IS', 'BEGIN', 'preparar();', 'IF saldo > 0 THEN', 'aprobar();', 'ELSE', 'rechazar();', 'END IF;', 'registrar();', 'END;'].join('\n');
    const [flow] = extractProcessFlows(text, 'p.sql', 'SQL / PL/SQL');
    expect(flow.name).toBe('PROCEDURE procesar');
    expect(flow.before[0]).toMatchObject({ label: 'preparar();', line: 3 });
    expect(flow.decision).toMatchObject({ label: 'saldo > 0', line: 4 });
    expect(flow.yes[0].label).toBe('aprobar();');
    expect(flow.no[0].label).toBe('rechazar();');
    expect(flow.after[0].label).toBe('registrar();');
    expect(flow.endLine).toBe(10);
  });
  it('representa una rama falsa sin acciones y omite literales', () => {
    const [flow] = extractProcessFlows("BEGIN\nIF estado = 'ACTIVO' THEN\nregistrar();\nEND IF;\nEND;", 'x.sql', 'SQL / PL/SQL');
    expect(flow.no).toEqual([]);
    expect(flow.decision?.label).not.toContain('ACTIVO');
  });
  it('no construye flujos para anidaciones, retornos o lenguajes no soportados', () => {
    expect(extractProcessFlows('BEGIN\nIF a THEN\nIF b THEN\nx();\nEND IF;\nEND IF;\nEND;', 'x.sql', 'SQL / PL/SQL')).toEqual([]);
    expect(extractProcessFlows('BEGIN\nRETURN x;\nEND;', 'x.sql', 'SQL / PL/SQL')).toEqual([]);
    expect(extractProcessFlows('BEGIN\nx();\nEND;', 'x.java', 'Java')).toEqual([]);
  });
});
