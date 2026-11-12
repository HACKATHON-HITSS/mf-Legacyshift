import { CodeFinding } from '../features/codigo-fuente/proyecto/project-findings';
import { AiSecurityFinding, AiSecurityReview } from './security-review.agent';
import { JavaTestResult } from './java-test-result';

/** Fixtures ficticios: nunca se incorporan al informe real del proyecto. */
export function createSecurityDemo() {
  const base = 'demo/src/main/java/com/example/simcards/';
  const proposals: AiSecurityFinding[] = [
    { id: 'demo:sql', estado: 'RIESGO', tipo: 'Inyección SQL', titulo: 'Una entrada se incorpora directamente a la consulta',
      path: base + 'SimcardRepository.java', line: 87,
      explicacion: 'En este ejemplo, el identificador recibido se concatena al texto SQL. Una entrada manipulada podría cambiar la consulta si llega sin controles adicionales.',
      fragmento: 'String sql = "SELECT * FROM simcards WHERE numero = " + numero;\nreturn statement.executeQuery(sql);', proteccion: null,
      correccion: 'Separar el valor de la consulta y enviarlo como parámetro.', prueba: 'Enviar un identificador con caracteres SQL y comprobar que se trata como dato, sin cambiar la consulta.', confianza: 'Alta' },
    { id: 'demo:secret', estado: 'RIESGO', tipo: 'Credencial literal', titulo: 'La conexión tiene una contraseña escrita en el código',
      path: base + 'DatabaseConfig.java', line: 24,
      explicacion: 'El escenario contiene una contraseña fija dentro de la configuración. Si fuera una credencial activa, compartir el código podría exponer el acceso a la base de datos.',
      fragmento: 'String password = "VALOR_OCULTO";\nreturn DriverManager.getConnection(url, user, password);', proteccion: null,
      correccion: 'Usar una configuración protegida y sustituir la credencial si se confirma su exposición.', prueba: 'Comprobar que la aplicación obtiene la credencial de la configuración protegida y que el repositorio no contiene el valor.', confianza: 'Alta' },
    { id: 'demo:xml', estado: 'CONTEXTO', tipo: 'Procesamiento XML', titulo: 'Falta confirmar cómo se protege la lectura de XML',
      path: base + 'XmlRequestParser.java', line: 46,
      explicacion: 'Se recibe un documento XML, pero el fragmento no muestra cómo se configura el lector. Hace falta comprobar el origen del documento y las restricciones aplicadas.',
      fragmento: 'DocumentBuilder builder = factory.newDocumentBuilder();\nreturn builder.parse(requestStream);', proteccion: null,
      correccion: 'Revisar la configuración completa del lector y sus restricciones de acceso a recursos externos.', prueba: 'En un entorno de pruebas, verificar que el lector rechaza referencias externas no permitidas.', confianza: 'Media' },
    { id: 'demo:param', estado: 'DESCARTADA', tipo: 'Consulta parametrizada', titulo: 'El valor de búsqueda se envía como parámetro',
      path: base + 'ClienteRepository.java', line: 63,
      explicacion: 'En este ejemplo, la consulta tiene un marcador y el identificador se asigna por separado. La concatenación SQL sospechada no aparece en este fragmento.',
      fragmento: 'PreparedStatement query = connection.prepareStatement("SELECT * FROM clientes WHERE id = ?");\nquery.setString(1, id);',
      fragmento_proteccion: 'query.setString(1, id);', proteccion: 'Se observa un marcador de parámetro y su asignación mediante setString.',
      correccion: 'Mantener la parametrización y revisar que el resto de las consultas siga el mismo criterio.', prueba: 'Comprobar que caracteres especiales en el identificador no modifican la estructura de la consulta.', confianza: 'Alta' }
  ];
  const checkedAt = new Date().toISOString();
  const review: AiSecurityReview = { status: 'complete', files: 8, total: 12, processed: 12, succeeded: 12, skippedFiles: 0, omittedLines: 0,
    discardedEvidence: 0, errors: [], findings: proposals, checkedAt };
  const tests: JavaTestResult = { agent: 'demo-java-tests', projectPath: 'Simcards · proyecto ficticio de demostración', checkedAt, status: 'failed',
    tests: { tests: 24, passed: 21, failures: 2, errors: 0, skipped: 1 },
    coverage: { line: { covered: 164, missed: 36, percent: 82 }, branch: { covered: 42, missed: 14, percent: 75 } },
    mockitoDeclared: true, coverageFiles: [], conclusion: 'Resultado simulado: 21 pruebas aprobadas, 2 fallidas y 1 omitida. Ninguna prueba se ejecutó en esta demostración.',
    limitations: 'Métricas ficticias para mostrar el diseño. No se ejecutó Maven, Mockito ni JaCoCo y no se evaluó el proyecto seleccionado.' };
  const local: CodeFinding[] = proposals.filter(item => item.estado !== 'DESCARTADA').map((item, index) => ({
    id: `demo:local:${index}`, category: 'vulnerabilidades', path: item.path, line: item.line, title: item.titulo,
    condition: item.explicacion, action: item.correccion, evidence: item.fragmento, severity: item.estado === 'RIESGO' ? 'Alta' : 'Media',
    limitation: 'Ejemplo ficticio; este código no pertenece al proyecto seleccionado.',
    security: { ruleId: `demo:${item.tipo}`, status: item.estado === 'RIESGO' ? 'pattern' : 'review', checked: item.explicacion,
      conclusion: 'Señal de ejemplo para demostrar la presentación del resultado.', nextStep: item.correccion }
  }));
  return { simulated: true as const, review, tests, local, scan: { files: 8, checks: 140, omittedCandidates: 12 } };
}
