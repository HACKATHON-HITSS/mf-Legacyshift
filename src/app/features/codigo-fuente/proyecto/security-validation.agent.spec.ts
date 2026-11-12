import { describe, expect, it } from 'vitest';
import { SECURITY_VALIDATION_AGENT } from './security-validation.agent';
import { analyzeLocalProject } from './local-project-analyzer';
import { extractCodeFindings } from './project-findings';

const scan = (source: string, language = 'JavaScript') => SECURITY_VALIDATION_AGENT.analyze(source, 'source.txt', language);

describe('Agente de comprobación estática de seguridad', () => {
  it('no confunde imports, namespaces, comentarios o mensajes de texto con riesgos', () => {
    const source = `import javax.xml.bind.JAXBContext;
      // eval(req.body.code); password = "test";
      /* logger.info(password); */
      const message = "eval(input)";
      console.log("password incorrecto");
      const namespace = "http://schemas.xmlsoap.org/wsdl/";`;
    const old = extractCodeFindings(source, 'source.txt', 'JavaScript').filter(item => item.category === 'vulnerabilidades');
    const result = SECURITY_VALIDATION_AGENT.analyze(source, 'source.txt', 'JavaScript', old);
    expect(result.findings).toEqual([]);
    expect(result.scan.omittedCandidates).toBeGreaterThan(0);
  });

  it('comprueba valores literales y oculta secretos sin marcar variables o placeholders', () => {
    const result = scan('const password = "private-secret-value";\nconst token = getToken();\nconst apiKey = "${API_KEY}";\nconst tokenType = "bearer";');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].security?.status).toBe('pattern');
    expect(JSON.stringify(result)).not.toContain('private-secret-value');
    expect(scan('credential=private-unquoted-value', 'Properties').findings).toHaveLength(1);
    expect(JSON.stringify(scan('credential=private-unquoted-value', 'Properties'))).not.toContain('private-unquoted-value');
    expect(scan('password=${DB_PASSWORD}\n# secret=test\n! password=example-value\noperation=eval(input)', 'Properties').findings).toEqual([]);
  });

  it('distingue llamadas sensibles de texto constante y métodos exec de expresiones regulares', () => {
    expect(scan('eval(req.body.code);').findings[0].security?.status).toBe('pattern');
    expect(scan('Runtime.getRuntime().exec(command);', 'Java').findings[0].security?.status).toBe('review');
    expect(scan('eval("1 + 1");\nregex.exec(input);').findings).toEqual([]);
  });

  it('distingue SQL concatenado con variables de consultas parametrizadas y literales fijos', () => {
    expect(scan('const query = "SELECT * FROM users WHERE id=" + req.query.id;').findings.map(item => item.security?.ruleId)).toContain('dynamic-sql');
    expect(scan('db.query("SELECT * FROM users WHERE id=?", [id]);').findings).toEqual([]);
    expect(scan('const query = "SELECT " + "id FROM users";').findings).toEqual([]);
    expect(scan('const message = String.format("Hola %s", name);').findings).toEqual([]);
  });

  it('detecta algoritmos y llamadas de carga de objetos sin confundir nombres genéricos', () => {
    expect(scan('MessageDigest.getInstance("MD5");', 'Java').findings[0].security?.ruleId).toBe('weak-hash');
    expect(scan('pickle.loads(data);', 'Python').findings[0].security?.ruleId).toBe('deserialize');
    expect(scan('loads(data);\nJSON.parse(data);').findings).toEqual([]);
  });

  it('revisa variables sensibles en logs sin marcar palabras escritas en mensajes', () => {
    expect(scan('logger.info(password);', 'Java').findings[0].security?.ruleId).toBe('secret-log');
    expect(scan('logger.info("password no informado");', 'Java').findings).toEqual([]);
  });

  it('reemplaza señales genéricas durante el análisis y exporta evidencia comprobada sin secretos', async () => {
    const source = 'import javax.xml.bind.JAXBContext;\nclass Config { String password = "private-secret-value"; }';
    const file = new File([source], 'Config.java');
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(source).buffer });
    const report = await analyzeLocalProject([file], () => undefined);
    const findings = report.findings.filter(item => item.category === 'vulnerabilidades');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ line: 2, security: { ruleId: 'literal-secret', status: 'pattern' } });
    expect(report.securityScan?.omittedCandidates).toBeGreaterThan(0);
    expect(JSON.stringify(findings)).not.toContain('private-secret-value');
    expect(report.securityScan?.files).toBe(1);
  });
});
