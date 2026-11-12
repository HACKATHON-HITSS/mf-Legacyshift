import { describe, expect, it } from 'vitest';
import { extractBusinessRules } from './business-rules';

describe('Matriz MVP de reglas', () => {
  it('identifica condiciones y consultas PL/SQL con ubicación y dependencia observada', () => {
    const rules = extractBusinessRules('CREATE PACKAGE BODY PKG_CLIENTE AS\nPROCEDURE VALIDAR IS\nBEGIN\n IF saldo < 0 THEN\n SELECT estado INTO v FROM CLIENTES;\n END IF;\nEND;', 'PKG_CLIENTE.pkb');
    expect(rules.find(rule => rule.location === 'línea 4')).toMatchObject({ ruleType: 'OTHER', component: 'PROCEDURE VALIDAR', snippet: 'IF saldo < 0 THEN' });
    expect(rules.find(rule => rule.location === 'línea 4')).toMatchObject({ locationType: 'LINE', startLine: 4, endLine: 4, artifactType: 'PKB' });
    expect(rules.find(rule => rule.ruleType === 'QUERY')?.dependencies).toEqual(['CLIENTES']);
  });
  it('registra nodos OSB con rutas diferenciadas y solo referencias explícitas', () => {
    const rules = extractBusinessRules('<p:root xmlns:p="http://www.bea.com/wli/sb/pipeline"><p:route ref="Cliente"/><p:route/><p:validate/></p:root>', 'proxy.pipeline');
    expect(rules).toHaveLength(3);
    expect(rules[0]).toMatchObject({ ruleType: 'ROUTING', location: '/root[1]/route[1]', dependencies: ['Cliente'] });
    expect(rules[0]).toMatchObject({ locationType: 'XML_NODE', startLine: null, xmlNodePath: '/root[1]/route[1]' });
    expect(rules[1].dependencies).toEqual([]);
    expect(rules[2].snippet).toContain('validate');
  });
  it('reconoce XSLT y evita publicar reglas con XML inválido o ajeno al alcance', () => {
    expect(extractBusinessRules('<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:template match="/"/></xsl:stylesheet>', 't.xsl')[0].ruleType).toBe('TRANSFORMATION');
    expect(extractBusinessRules('<route>', 'invalid.pipeline')).toEqual([]);
    expect(extractBusinessRules('<root><route/></root>', 'settings.xml')).toEqual([]);
  });
});
