import { Injectable, inject, signal } from '@angular/core';
import { z } from 'zod';
import { environment } from '../../environments/environment';
import { AnalysisSessionService } from './analysis-session.service';

const count = z.number().int().nonnegative();
const counter = z.object({ covered: count, missed: count, percent: z.number().min(0).max(100).nullable() });
const resultSchema = z.object({
  agent: z.string(), projectPath: z.string(), checkedAt: z.string(),
  status: z.enum(['passed', 'failed', 'no_tests', 'build_failed', 'timeout', 'not_configured', 'not_applicable']),
  tests: z.object({ tests: count, failures: count, errors: count, skipped: count, passed: count }),
  coverage: z.object({ line: counter.optional(), branch: counter.optional() }).nullable(),
  mockitoDeclared: z.boolean(), coverageFiles: z.array(z.string()), conclusion: z.string(), limitations: z.string()
});

@Injectable({ providedIn: 'root' })
export class JavaTestService {
  private readonly store = inject(AnalysisSessionService);
  readonly running = signal(false);
  readonly error = this.store.javaTestError;

  async run(projectPath: string): Promise<void> {
    if (!projectPath.trim()) return;
    await this.runPayload({ projectPath: projectPath.trim() });
  }

  async runFiles(files: readonly File[], projectName: string): Promise<void> {
    const excluded = new Set(['.git', 'node_modules', 'target', 'build', '.angular', '.gradle', '.idea']);
    const selected = files.filter(file => {
      const parts = (file.webkitRelativePath || file.name).split('/');
      return !parts.some(part => excluded.has(part.toLowerCase())) && !/^\.env(?:\.|$)/i.test(file.name);
    });
    if (!this.store.session()) return;
    if (!selected.some(file => file.name === 'pom.xml')) {
      const java = selected.some(file => /\.(?:java|kt)$/i.test(file.name));
      this.error.set('');
      this.store.javaTests.set({ agent: 'java-security-test-runner', projectPath: projectName, checkedAt: new Date().toISOString(),
        status: java ? 'not_configured' : 'not_applicable', tests: { tests: 0, passed: 0, failures: 0, errors: 0, skipped: 0 }, coverage: null,
        mockitoDeclared: false, coverageFiles: [],
        conclusion: java ? 'No se ejecutaron pruebas Java: el proyecto seleccionado no incluye pom.xml. Hay que preparar su configuración de pruebas Maven.' : 'No se ejecutaron pruebas Java: la selección no contiene un proyecto Java con configuración Maven.',
        limitations: 'Sin pruebas ejecutadas no se puede evaluar su comportamiento ni medir cobertura. El análisis estático sí permanece disponible.' });
      return;
    }
    await this.runPayload(async () => {
      if (selected.length > 2000 || selected.some(file => file.size > 10 * 1024 * 1024) || selected.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) throw new Error('Las pruebas Java admiten hasta 2.000 archivos, 10 MB por archivo y 50 MB en total.');
      const upload = [];
      let total = 0;
      for (const file of selected) {
        const bytes = new Uint8Array(await file.arrayBuffer()); total += bytes.length;
        if (bytes.length > 10 * 1024 * 1024 || total > 50 * 1024 * 1024) throw new Error('Los archivos seleccionados superan el tamaño permitido para las pruebas Java.');
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        upload.push({ path: file.webkitRelativePath || file.name, data: btoa(binary) });
      }
      return { projectName, files: upload };
    });
  }

  private async runPayload(payload: object | (() => Promise<object>)): Promise<void> {
    const session = this.store.session();
    if (!session) return;
    if (this.running()) { this.error.set('Otra ejecución de pruebas Java sigue en curso. Vuelve a analizar el proyecto cuando termine.'); return; }
    this.running.set(true); this.error.set(''); this.store.javaTests.set(null);
    try {
      const body = typeof payload === 'function' ? await payload() : payload;
      if (this.store.session() !== session) return;
      const response = await fetch(`${environment.huaweiApiBaseUrl}/api/legacyshift/java-tests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(200_000)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'No se pudieron ejecutar las pruebas Java.');
      const result = resultSchema.safeParse(data);
      if (!result.success) throw new Error('El servidor devolvió un informe de pruebas inválido.');
      if (this.store.session() === session) this.store.javaTests.set(result.data);
    } catch (error) {
      if (this.store.session() === session) this.error.set(error instanceof Error ? error.message : 'No se pudo contactar con el servidor local de análisis.');
    } finally { this.running.set(false); }
  }
}
