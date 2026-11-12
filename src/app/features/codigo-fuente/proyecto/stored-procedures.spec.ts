import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeLocalProject } from './local-project-analyzer';
import { parseJavaFile, resolveJavaAnalysis } from './java-analysis';
import { analyzeConfiguredProcedures, extractConfiguredProcedures } from './stored-procedures';

describe('Procedimientos almacenados configurados en properties', () => {
  it('extrae SP con paquete o prefijo, incluso con escapes y separadores variados, e ignora otros valores', () => {
    const text = [
      '#SP Actualizar numero de serie de telefono',
      'sp.actualizarSerieTelef = PKG\\_SANS_SIST_COMERCIALES.USP_ZNS_NRO_SERIE_TELEF',
      'sp.cod.exito=0',
      'sp.usuario=ADMIN',
      'proceso.bloqueo: USP_BLOQUEO',
      '! sp.comentado = PKG.SP_X',
      'jdbc.url=jdbc:oracle:thin:@host:1521:SID'
    ].join('\n');
    expect(extractConfiguredProcedures(text, 'sp.properties')).toEqual([
      { key: 'sp.actualizarSerieTelef', procedure: 'PKG_SANS_SIST_COMERCIALES.USP_ZNS_NRO_SERIE_TELEF', path: 'sp.properties', line: 2 },
      { key: 'proceso.bloqueo', procedure: 'USP_BLOQUEO', path: 'sp.properties', line: 5 }
    ]);
  });

  it('distingue invocado, referenciado sin llamada y sin uso, siguiendo constantes y omitiendo comentarios', () => {
    const constants = 'class K { static final String SP = "sp.a"; }';
    const dao = [
      'class Dao {',
      '  void llamar() {',
      '    String url = "http://host/x"; String sp = props.getProperty(K.SP);',
      '    conn.prepareCall("{call " + sp + "(?)}");',
      '  }',
      '  String leer() { return props.getProperty("sp.b"); }',
      '  // props.getProperty("sp.c");',
      '}'
    ].join('\n');
    const java = resolveJavaAnalysis([parseJavaFile(constants, 'K.java'), parseJavaFile(dao, 'Dao.java')]);
    const procedures = ['a', 'b', 'c'].map((name, index) => ({ key: `sp.${name}`, procedure: `PKG.SP_${name.toUpperCase()}`, path: 'sp.properties', line: index + 1 }));
    const result = analyzeConfiguredProcedures(procedures, [{ path: 'K.java', language: 'Java', text: constants }, { path: 'Dao.java', language: 'Java', text: dao }], java);
    expect(result.map(item => item.status)).toEqual(['INVOCADO', 'LEIDO_SIN_LLAMADA', 'SIN_REFERENCIAS']);
    expect(result[0].usages).toEqual([
      expect.objectContaining({ path: 'Dao.java', line: 3, kind: 'Uso de constante', constant: 'SP', method: 'Dao.llamar', invokes: true }),
      expect.objectContaining({ path: 'K.java', line: 1, kind: 'Constante', constant: 'SP', method: null, invokes: false })
    ]);
    expect(result[1].usages[0]).toMatchObject({ kind: 'Clave literal', method: 'Dao.leer', invokes: false });
  });

  it('reconoce placeholders de Spring en XML y el nombre literal del SP', () => {
    const xml = '<bean class="SerieSP"><property name="sql" value="${sp.a}"/></bean>\n<!-- ${sp.b} -->';
    const sql = 'BEGIN PKG.SP_C(1); END;';
    const procedures = ['a', 'b', 'c'].map(name => ({ key: `sp.${name}`, procedure: `PKG.SP_${name.toUpperCase()}`, path: 'sp.properties', line: 1 }));
    const result = analyzeConfiguredProcedures(procedures, [{ path: 'beans.xml', language: 'XML', text: xml }, { path: 'job.sql', language: 'SQL / PL/SQL', text: sql }], resolveJavaAnalysis([]));
    expect(result.map(item => [item.status, item.usages.map(usage => usage.kind)])).toEqual([
      ['LEIDO_SIN_LLAMADA', ['Placeholder ${...}']], ['SIN_REFERENCIAS', []], ['LEIDO_SIN_LLAMADA', ['Nombre literal del SP']]
    ]);
  });

  it('integra el resultado del proyecto de ejemplo en dependencias, entradas/salidas y deuda técnica', async () => {
    const root = join(process.cwd(), 'samples', 'legacy-telco');
    const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]);
    const files = walk(root).map(path => {
      const text = readFileSync(path, 'utf8');
      const file = new File([text], path.split(/[\\/]/).pop() as string);
      Object.defineProperty(file, 'webkitRelativePath', { value: `legacy-telco/${relative(root, path).split(/[\\/]/).join('/')}` });
      Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(text).buffer });
      return file;
    });
    const report = await analyzeLocalProject(files, () => undefined);
    const byKey = Object.fromEntries(report.storedProcedures.map(item => [item.key, item]));
    expect(byKey['sp.actualizarSerieTelef']).toMatchObject({ procedure: 'PKG_SANS_SIST_COMERCIALES.USP_ZNS_NRO_SERIE_TELEF', status: 'INVOCADO' });
    expect(byKey['sp.actualizarSerieTelef'].usages.find(usage => usage.invokes)).toMatchObject({ path: 'legacy-telco/src/pe/telco/activacion/dao/EquipoDAO.java', line: 9, method: 'EquipoDAO.actualizarSerie' });
    expect(byKey['sp.consultarHistorialEquipo'].status).toBe('SIN_REFERENCIAS');
    expect(byKey['sp.bloquearLinea'].status).toBe('LEIDO_SIN_LLAMADA');
    expect(report.dependencies.find(item => item.name.startsWith('PKG_SANS_SIST_COMERCIALES.USP_ZNS_NRO_SERIE_TELEF'))?.kind).toContain('invocado. Invocado en EquipoDAO.actualizarSerie');
    expect(report.findings.filter(item => item.category === 'entradas-salidas' && item.title.includes('USP_ZNS_NRO_SERIE_TELEF'))).toHaveLength(1);
    expect(report.findings.filter(item => item.category === 'deuda-tecnica' && item.title.startsWith('Procedimiento configurado')).map(item => item.title).sort())
      .toEqual(['Procedimiento configurado sin invocación directa', 'Procedimiento configurado sin uso']);
  });
});
