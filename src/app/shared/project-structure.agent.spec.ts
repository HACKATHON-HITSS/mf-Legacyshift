import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createProjectStructureZip } from './project-structure.agent';

describe('Estructura de proyecto', () => {
  it('genera un ZIP de referencia con archivos vacíos y sin artefactos de compilación', () => {
    const entries = unzipSync(createProjectStructureZip());
    const names = Object.keys(entries);
    expect(names).toContain('SimcardsApp/pom.xml');
    expect(names).toContain('SimcardsApp/.mvn/wrapper/maven-wrapper.properties');
    expect(names).toContain('SimcardsApp/libs/');
    expect(names).toContain('SimcardsApp/src/main/java/com/claro/biometria/traceability/support/controller/TraceabilityController.java');
    expect(names).toContain('SimcardsApp/src/test/java/com/claro/biometria/traceability/support/service/impl/TraceabilityServiceImplTest.java');
    expect(names.every(name => name.startsWith('SimcardsApp/') && entries[name].length === 0)).toBe(true);
    expect(names.some(name => name.startsWith('SimcardsApp/.git/') || name.startsWith('SimcardsApp/target/') || name.endsWith('.jar'))).toBe(false);
  });
});
