import { describe, expect, it } from 'vitest';
import { maskSecuritySecrets, parseSecurityReview, SECURITY_REVIEW_PROMPT, securityReviewChunks } from './security-review.agent';

const chunk = { id: 'Demo.java:10', path: 'Demo.java', startLine: 10, code: 'String sql = "SELECT * FROM items WHERE id=" + input;\ndb.execute(sql);\nquery.setString(1, input);' };
const candidate = { estado: 'RIESGO', tipo: 'SQL', titulo: 'Revisar consulta', explicacion: 'Se concatena un dato; falta confirmar su origen.', fragmento: 'db.execute(sql);', proteccion: null, correccion: 'Enviar valores como parámetros.', prueba: 'Probar una entrada inesperada y verificar que se trate como dato.', confianza: 'Media' };
const response = (hallazgos: object[]) => JSON.stringify({ resultados: [{ id: chunk.id, resumen: 'Revisión parcial.', hallazgos }] });

describe('Revisión MaaS con evidencia', () => {
  it('oculta secretos sin ocultar asignaciones dinámicas ni alterar las líneas', () => {
    const source = 'String password = "private-value";\ntoken = getToken();\nString query = "SELECT * FROM items";';
    const masked = maskSecuritySecrets(source);
    expect(masked).not.toContain('private-value');
    expect(masked).toContain('VALOR_OCULTO');
    expect(masked).toContain('token = getToken()');
    expect(masked).toContain('SELECT * FROM items');
    expect(masked.split('\n')).toHaveLength(source.split('\n').length);
    expect(maskSecuritySecrets('db.password=private-value', true)).not.toContain('private-value');
    expect(maskSecuritySecrets('https://user:private-value@host/path?token=private-query')).not.toMatch(/private-value|private-query/);
    expect(maskSecuritySecrets('<password>private-value</password><property value="private-query" name="db.password"/>')).not.toMatch(/private-value|private-query/);
    expect(securityReviewChunks('password: private-value', 'config.yml').chunks[0].code).not.toContain('private-value');
  });

  it('cubre líneas de archivos largos con límites explícitos y cuenta líneas omitidas', () => {
    const source = Array.from({ length: 350 }, (_, index) => `line${index}`).join('\n');
    const { chunks } = securityReviewChunks(source, 'Demo.java');
    const covered = new Set(chunks.flatMap(item => item.code.split('\n').map((_, index) => item.startLine + index)));
    expect(covered.size).toBe(350);
    expect(chunks.every(item => item.code.length <= 8000 && item.code.split('\n').length <= 150)).toBe(true);
    expect(securityReviewChunks('a\n' + 'x'.repeat(9000) + '\nb', 'Demo.java').omittedLines).toBe(1);
    expect(SECURITY_REVIEW_PROMPT.length).toBeLessThanOrEqual(2000);
  });

  it('ubica la evidencia real y omite fragmentos inventados o ambiguos', () => {
    const result = parseSecurityReview(response([candidate, { ...candidate, fragmento: 'inexistente' }]), [chunk]);
    expect(result.findings[0]).toMatchObject({ path: 'Demo.java', line: 11, estado: 'RIESGO' });
    expect(result.discardedEvidence).toBe(1);
    const repeated = { ...chunk, code: 'db.execute(sql); db.execute(sql);' };
    expect(parseSecurityReview(response([candidate]), [repeated]).discardedEvidence).toBe(1);
    expect(() => parseSecurityReview('incorrecto', [chunk])).toThrow(/JSON/);
    expect(() => parseSecurityReview(JSON.stringify({ resultados: [] }), [chunk])).toThrow(/todos/);
  });

  it('no mantiene descartes de IA sin un fragmento comprobable de protección', () => {
    const missing = parseSecurityReview(response([{ ...candidate, estado: 'DESCARTADA', proteccion: 'Está parametrizado.' }]), [chunk]);
    expect(missing.findings[0].estado).toBe('CONTEXTO');
    const supported = parseSecurityReview(response([{ ...candidate, estado: 'DESCARTADA', proteccion: 'Se asigna el parámetro.', fragmento_proteccion: 'query.setString(1, input);' }]), [chunk]);
    expect(supported.findings[0].estado).toBe('DESCARTADA');
  });
});
