import { zipSync } from 'fflate';

const javaRoot = 'src/main/java/com/claro/biometria/traceability/support';
const testRoot = 'src/test/java/com/claro/biometria/traceability/support';
const files = [
  '.gitignore', '.mvn/wrapper/maven-wrapper.properties', 'Dockerfile', 'mvnw', 'mvnw.cmd', 'pom.xml', 'README.md', 'settings.xml',
  `${javaRoot}/TraceabilityApplication.java`,
  `${javaRoot}/configuration/security/SecurityConfig.java`,
  `${javaRoot}/configuration/swagger/SwaggerConfig.java`,
  `${javaRoot}/controller/TraceabilityController.java`,
  `${javaRoot}/controller/impl/TraceabilityControllerImpl.java`,
  `${javaRoot}/dto/mapper/TraceabilityMapper.java`,
  `${javaRoot}/dto/request/RequestHeaders.java`,
  `${javaRoot}/dto/response/ErrorResponse.java`,
  `${javaRoot}/dto/response/ResponseAudit.java`,
  `${javaRoot}/dto/response/TraceabilityApiResponse.java`,
  `${javaRoot}/exception/BusinessException.java`,
  `${javaRoot}/exception/GlobalExceptionHandler.java`,
  `${javaRoot}/model/TrazabilidadEventoEntity.java`,
  `${javaRoot}/model/TrazaServicioEntity.java`,
  `${javaRoot}/repository/TrazabilidadEventoRepository.java`,
  `${javaRoot}/repository/TrazaServicioRepository.java`,
  `${javaRoot}/security/filter/JwtRequestFilter.java`,
  `${javaRoot}/security/service/JwtValidatorService.java`,
  `${javaRoot}/security/service/impl/JwtValidatorServiceImpl.java`,
  `${javaRoot}/service/TracealibityService.java`,
  `${javaRoot}/service/impl/TraceabilityServiceImpl.java`,
  `${javaRoot}/utils/ActivityLogger.java`,
  `${javaRoot}/utils/ConstanApi.java`,
  'src/main/resources/application-local.properties',
  'src/main/resources/application.properties',
  'src/main/resources/checkstyle.xml',
  'src/main/resources/logback.xml',
  `${testRoot}/service/impl/TraceabilityServiceImplTest.java`,
  `${testRoot}/service/utils/ActivityLoggerTest.java`
];

export function createProjectStructureZip(): Uint8Array {
  const entries: Record<string, Uint8Array> = { 'SimcardsApp/': new Uint8Array(0), 'SimcardsApp/libs/': new Uint8Array(0) };
  for (const file of files) {
    const parts = file.split('/');
    let path = 'SimcardsApp/';
    for (const directory of parts.slice(0, -1)) {
      path += `${directory}/`;
      entries[path] = new Uint8Array(0);
    }
    entries[path + parts[parts.length - 1]] = new Uint8Array(0);
  }
  return zipSync(entries);
}
