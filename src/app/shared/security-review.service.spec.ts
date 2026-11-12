import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecurityReviewService } from './security-review.service';
import { AnalysisSessionService } from './analysis-session.service';
import { HuaweiAnalysisService } from './huawei-analysis.service';
import { analyzeLocalProject } from '../features/codigo-fuente/proyecto/local-project-analyzer';
import { SecurityReviewChunk } from './security-review.agent';

async function fixture(source = 'const password = "private-value";\neval(input);') {
  const file = new File([source], 'Demo.js');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(source).buffer });
  const report = await analyzeLocalProject([file], () => undefined);
  TestBed.inject(AnalysisSessionService).complete('Demo', report);
  const huawei = TestBed.inject(HuaweiAnalysisService);
  huawei.connection.set({ configured: true, verified: true, model: 'real-model', url: '' });
  vi.spyOn(huawei, 'refreshConnection').mockResolvedValue();
  return { file, report, huawei, store: TestBed.inject(AnalysisSessionService), service: TestBed.inject(SecurityReviewService) };
}
function noFindings(context: unknown) {
  const chunks = (context as { fragmentos: SecurityReviewChunk[] }).fragmentos;
  return JSON.stringify({ resultados: chunks.map(item => ({ id: item.id, resumen: 'Sin propuestas en este fragmento.', hallazgos: [] })) });
}

describe('Revisión MaaS durante el análisis', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  it('envía código ocultando secretos, sin requerir Maven, y conserva el detector local', async () => {
    const { file, store, huawei, service } = await fixture();
    const original = store.session()?.report.findings;
    const ask = vi.spyOn(huawei, 'ask').mockImplementation(async (_, context) => noFindings(context));
    await service.start([file]);
    expect(ask).toHaveBeenCalledOnce();
    expect(JSON.stringify(ask.mock.calls[0][1])).not.toContain('private-value');
    expect(ask.mock.calls[0][2]?.purpose).toBe('security');
    expect(store.aiSecurityReview()).toMatchObject({ status: 'complete', total: 1, succeeded: 1 });
    expect(store.session()?.report.findings).toBe(original);
    expect(store.exportData().aiSecurityReview?.succeeded).toBe(1);
  });

  it('registra fallos parciales y continúa con otros lotes', async () => {
    const { file, store, huawei, service } = await fixture(Array.from({ length: 350 }, (_, index) => `// línea ${index}`).join('\n'));
    vi.spyOn(huawei, 'ask').mockResolvedValueOnce('no es JSON').mockImplementation(async (_, context) => noFindings(context));
    await service.start([file]);
    expect(store.aiSecurityReview()?.status).toBe('partial');
    expect(store.aiSecurityReview()?.succeeded).toBeGreaterThan(0);
    expect(store.aiSecurityReview()?.errors.length).toBe(1);
  });

  it('no presenta cero hallazgos como revisión terminada si Huawei no está disponible', async () => {
    const { file, store, huawei, service } = await fixture();
    huawei.connection.set(null);
    const ask = vi.spyOn(huawei, 'ask');
    await service.start([file]);
    expect(ask).not.toHaveBeenCalled();
    expect(store.aiSecurityReview()?.status).toBe('unavailable');
  });

  it('descarta respuestas pendientes si cambia el proyecto', async () => {
    const { file, store, report, huawei, service } = await fixture();
    let finish!: (value: string) => void;
    let context: unknown;
    vi.spyOn(huawei, 'ask').mockImplementation((_, value) => { context = value; return new Promise(resolve => { finish = resolve; }); });
    const pending = service.start([file]);
    await vi.waitFor(() => expect(finish).toBeDefined());
    store.complete('Otro', report); finish(noFindings(context)); await pending;
    expect(store.aiSecurityReview()).toBeNull();
  });

  it('permite detener la revisión sin marcarla como terminada', async () => {
    const { file, store, huawei, service } = await fixture();
    vi.spyOn(huawei, 'ask').mockImplementation((_, __, options) => new Promise((_, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('Detenido')), { once: true });
    }));
    const pending = service.start([file]);
    await vi.waitFor(() => expect(huawei.ask).toHaveBeenCalled());
    service.cancel(); await pending;
    expect(store.aiSecurityReview()?.status).toBe('cancelled');
    expect(store.aiSecurityReview()?.succeeded).toBe(0);
  });
});
