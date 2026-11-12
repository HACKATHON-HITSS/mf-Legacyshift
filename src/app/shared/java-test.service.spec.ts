import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JavaTestService } from './java-test.service';
import { AnalysisSessionService } from './analysis-session.service';
import { analyzeLocalProject } from '../features/codigo-fuente/proyecto/local-project-analyzer';

const result = {
  agent: 'java-security-test-runner', projectPath: 'D:\\Java\\Demo', checkedAt: '2026-11-11T23:00:00Z',
  status: 'passed', tests: { tests: 3, passed: 3, failures: 0, errors: 0, skipped: 0 },
  coverage: { line: { covered: 8, missed: 2, percent: 80 } }, mockitoDeclared: true,
  coverageFiles: [], conclusion: 'Pruebas aprobadas; no demuestra ausencia de vulnerabilidades.', limitations: 'Pruebas existentes'
};

describe('Pruebas Java locales', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  afterEach(() => { vi.unstubAllGlobals(); TestBed.resetTestingModule(); });

  it('uploads the selected Maven project with relative paths, not a separately entered folder', async () => {
    const store = TestBed.inject(AnalysisSessionService);
    store.complete('Demo', await analyzeLocalProject([], () => undefined));
    const source = '<project/>';
    const pom = new File([source], 'pom.xml');
    Object.defineProperty(pom, 'webkitRelativePath', { value: 'Demo/pom.xml' });
    Object.defineProperty(pom, 'arrayBuffer', { value: async () => new TextEncoder().encode(source).buffer });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ...result, projectPath: 'Demo' })); vi.stubGlobal('fetch', fetchMock);
    await TestBed.inject(JavaTestService).runFiles([pom], 'Demo');
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.projectPath).toBeUndefined();
    expect(payload.projectName).toBe('Demo');
    expect(payload.files).toEqual([{ path: 'Demo/pom.xml', data: btoa(source) }]);
    expect(store.javaTests()?.projectPath).toBe('Demo');
  });

  it('explicitly marks Java projects without Maven as not executed', async () => {
    const store = TestBed.inject(AnalysisSessionService);
    store.complete('Legacy', await analyzeLocalProject([], () => undefined));
    vi.stubGlobal('fetch', vi.fn());
    await TestBed.inject(JavaTestService).runFiles([new File(['class Demo {}'], 'Demo.java')], 'Legacy');
    expect(fetch).not.toHaveBeenCalled();
    expect(store.javaTests()?.status).toBe('not_configured');
    expect(store.javaTests()?.coverage).toBeNull();
    expect(store.javaTests()?.conclusion).toContain('pom.xml');
  });

  it('uses only the local server, stores the real result and includes it in the export', async () => {
    const store = TestBed.inject(AnalysisSessionService);
    store.complete('Demo', await analyzeLocalProject([], () => undefined));
    const fetchMock = vi.fn().mockResolvedValue(Response.json(result)); vi.stubGlobal('fetch', fetchMock);
    await TestBed.inject(JavaTestService).run(result.projectPath);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/legacyshift/java-tests');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ projectPath: result.projectPath });
    expect(store.javaTests()?.tests.passed).toBe(3);
    expect(store.exportData().javaTests?.coverage?.line?.percent).toBe(80);
    store.clear(); expect(store.javaTests()).toBeNull();
  });

  it('discards a response if the selected project changed during execution', async () => {
    const store = TestBed.inject(AnalysisSessionService);
    const report = await analyzeLocalProject([], () => undefined);
    store.complete('First', report);
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const pending = TestBed.inject(JavaTestService).run(result.projectPath);
    store.complete('Second', report); finish(Response.json(result)); await pending;
    expect(store.javaTests()).toBeNull();
  });

  it('reports unavailable or malformed test results instead of indicating success', async () => {
    const store = TestBed.inject(AnalysisSessionService);
    store.complete('Demo', await analyzeLocalProject([], () => undefined));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'passed' })));
    const service = TestBed.inject(JavaTestService); await service.run(result.projectPath);
    expect(service.error()).toContain('inválido'); expect(store.javaTests()).toBeNull();
    store.clear(); expect(service.error()).toBe('');
  });
});
