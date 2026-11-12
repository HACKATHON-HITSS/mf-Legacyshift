import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../app.routes';
import { AppComponent } from '../app.component';
import { AnalysisSessionService } from './analysis-session.service';
import { AnalysisModuleComponent } from './analysis-module.component';
import { ProyectoComponent } from '../features/codigo-fuente/proyecto/proyecto.component';
import { analyzeLocalProject } from '../features/codigo-fuente/proyecto/local-project-analyzer';

async function exampleReport() {
  const file = new File(['if (amount > limit) { reject(); }'], 'Account.java');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode('if (amount > limit) { reject(); }').buffer });
  return analyzeLocalProject([file], () => undefined);
}

describe('Project analysis flow', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter(routes)] }));
  afterEach(() => { vi.unstubAllGlobals(); TestBed.resetTestingModule(); });

  it('shares one report across all modules and preserves approvals across navigation', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    const store = TestBed.inject(AnalysisSessionService);
    const report = await exampleReport();
    store.complete('AccountApp', report);
    const rule = report.findings.find(item => item.category === 'reglas')!;
    store.decide(rule.id, 'Aprobada', 'Validada con negocio');
    fixture.detectChanges();
    for (const path of ['analisis/reglas', 'analisis/logica', 'analisis/condiciones', 'analisis/entradas-salidas', 'analisis/datos-hardcodeados', 'analisis/deuda-tecnica', 'analisis/vulnerabilidades', 'analisis/dependencias', 'analisis/arquitectura', 'decisiones/aprobar-reglas', 'decisiones/tecnologia', 'decisiones/arquitectura', 'decisiones/chat', 'decisiones/exportar']) {
      await router.navigateByUrl(`/${path}`); fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('AccountApp');
      expect(fixture.nativeElement.textContent).not.toContain('Sin contenido.');
      expect(store.decisions()[rule.id]?.status).toBe('Aprobada');
    }
    await router.navigateByUrl('/codigo-fuente/proyecto'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Resultados de AccountApp');
  });

  it('offers a clear start point without a project and clears stale decisions on replacement', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/analisis/reglas'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Primero analiza un proyecto');
    const store = TestBed.inject(AnalysisSessionService);
    const report = await exampleReport(); store.complete('First', report);
    store.decide(report.findings[1].id, 'Aprobada', 'approved'); store.technology.set('Java');
    store.complete('Second', report);
    expect(store.decisions()).toEqual({}); expect(store.technology()).toBe('');
  });

  it('builds the shared matrix when the project analysis button is invoked', async () => {
    const fixture = TestBed.createComponent(ProyectoComponent);
    const file = new File(['if (amount > limit) reject();'], 'Account.java');
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode('if (amount > limit) reject();').buffer });
    fixture.componentInstance.onFileSelected({ files: [file], value: 'Account.java' } as unknown as HTMLInputElement);
    await fixture.componentInstance.analyzeProject(); fixture.detectChanges();
    const store = TestBed.inject(AnalysisSessionService);
    expect(store.session()?.project).toBe('Account.java');
    expect(store.session()?.report.findings.some(item => item.category === 'reglas')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Ver matriz de reglas y resultados');
  });

  it('discards stale analysis that finishes after another selection replaces the project', async () => {
    const fixture = TestBed.createComponent(ProyectoComponent);
    let finish!: (value: ArrayBuffer) => void;
    const file = new File(['if (old) reject();'], 'old.java');
    Object.defineProperty(file, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>(resolve => { finish = resolve; }) });
    fixture.componentInstance.onFileSelected({ files: [file], value: '' } as unknown as HTMLInputElement);
    const pending = fixture.componentInstance.analyzeProject();
    const store = TestBed.inject(AnalysisSessionService);
    store.complete('NewProject', await exampleReport());
    finish(new TextEncoder().encode('if (old) reject();').buffer);
    await pending;
    expect(store.session()?.project).toBe('NewProject');
  });

  it('keeps the local report usable when Huawei is unavailable', async () => {
    const fixture = TestBed.createComponent(AnalysisModuleComponent);
    fixture.componentRef.setInput('section', 'reglas');
    TestBed.inject(AnalysisSessionService).complete('AccountApp', await exampleReport());
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    fixture.detectChanges();
    await fixture.componentInstance.askHuawei(); fixture.detectChanges();
    expect(fixture.componentInstance.aiError()).toContain('No se pudo contactar');
    expect(fixture.componentInstance.rows().length).toBe(1);
    expect(fixture.componentInstance.isAsking()).toBe(false);
  });

  it('sends bounded report context without credentials or complete source files', async () => {
    const fixture = TestBed.createComponent(AnalysisModuleComponent);
    fixture.componentRef.setInput('section', 'reglas');
    const store = TestBed.inject(AnalysisSessionService);
    store.complete('AccountApp', await exampleReport());
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answer: 'Revisar el límite de la operación.' }) });
    vi.stubGlobal('fetch', mockFetch); fixture.detectChanges();
    await fixture.componentInstance.askHuawei();
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    const body = JSON.parse(options.body);
    expect(body.context.included).toHaveLength(1);
    expect(body.context.included[0].path).toBe('Account.java');
    expect(body.context.files).toBeUndefined();
    expect(fixture.componentInstance.aiAnswer()).toContain('Revisar el límite');
  });

  it('paginates without losing rows and resets pagination when filtering', async () => {
    const fixture = TestBed.createComponent(AnalysisModuleComponent);
    fixture.componentRef.setInput('section', 'dependencias');
    const report = await exampleReport();
    report.dependencies = Array.from({ length: 61 }, (_, index) => ({ name: `library-${index}`, path: 'package.json', line: 0, kind: 'dependencies' }));
    TestBed.inject(AnalysisSessionService).complete('ManyDependencies', report);
    fixture.detectChanges();
    expect(fixture.componentInstance.visible()).toHaveLength(25);
    fixture.componentInstance.page.set(2);
    expect(fixture.componentInstance.visible()).toHaveLength(11);
    fixture.componentInstance.filter('library-60');
    expect(fixture.componentInstance.page()).toBe(0);
    expect(fixture.componentInstance.visible()).toHaveLength(1);
  });

  it('muestra en vulnerabilidades un resumen y ubicaciones sin clasificar inventadamente los valores sensibles', async () => {
    const fixture = TestBed.createComponent(AnalysisModuleComponent);
    fixture.componentRef.setInput('section', 'vulnerabilidades');
    const report = await exampleReport();
    report.hardcoded.push({ path: 'config.properties', line: 4, name: 'Configuración sensible con valor literal', kind: 'Revisión manual; valor no mostrado' });
    TestBed.inject(AnalysisSessionService).complete('Proyecto', report);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('config.properties');
    expect(fixture.nativeElement.textContent).toContain('Prioridad sin clasificar');
    expect(fixture.nativeElement.textContent).not.toContain('Reglas aprobadas');
    expect(fixture.nativeElement.textContent).not.toContain('¿Qué significan estos riesgos?');
    expect(fixture.componentInstance.vulnerabilityFileCount()).toBe(1);
  });

  it('shares matrix status and observations with the approval screen and clears them for a new analysis', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    const report = await exampleReport();
    const { extractBusinessRules } = await import('../features/codigo-fuente/proyecto/business-rules');
    report.businessRules = extractBusinessRules('IF total > 0 THEN', 'regla.sql');
    const rule = report.businessRules[0];
    const store = TestBed.inject(AnalysisSessionService);
    store.complete('Demo', report);
    await router.navigateByUrl('/analisis/reglas'); fixture.detectChanges();
    const module = TestBed.createComponent(AnalysisModuleComponent);
    module.componentRef.setInput('section', 'reglas'); module.detectChanges();
    module.componentInstance.setRuleStatus(rule.ruleId, 'VALIDATED');
    module.componentInstance.setRuleNote(rule.ruleId, 'Validada por el especialista');
    await router.navigateByUrl('/decisiones/aprobar-reglas'); fixture.detectChanges();
    expect(store.ruleStatuses()[rule.ruleId]).toBe('VALIDATED');
    expect(store.ruleNotes()[rule.ruleId]).toBe('Validada por el especialista');
    expect(fixture.nativeElement.textContent).toContain('Condición PL/SQL');
    store.complete('Otro', report);
    expect(store.ruleStatuses()).toEqual({});
    expect(store.ruleNotes()).toEqual({});
  });

  it('shows the Java entry point and allows viewing its method evidence', async () => {
    const report = await exampleReport();
    const { parseJavaFile, resolveJavaAnalysis } = await import('../features/codigo-fuente/proyecto/java-analysis');
    report.java = resolveJavaAnalysis([parseJavaFile('class DemoServlet extends HttpServlet { public void doGet() { run(); } void run() {} }', 'DemoServlet.java')]);
    TestBed.inject(AnalysisSessionService).complete('Demo Java', report);
    const fixture = TestBed.createComponent(AnalysisModuleComponent);
    fixture.componentRef.setInput('section', 'logica'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('DemoServlet.doGet');
    expect(fixture.nativeElement.textContent).toContain('Destino posible');
    expect(fixture.nativeElement.textContent).toContain('DemoServlet.java');
  });

  it('generates reviewable business rules from a selected method and preserves local evidence', async () => {
    const { parseJavaFile, resolveJavaAnalysis } = await import('../features/codigo-fuente/proyecto/java-analysis');
    const { HuaweiAnalysisService } = await import('./huawei-analysis.service');
    const report = await exampleReport();
    report.java = resolveJavaAnalysis([parseJavaFile('class Pago { void ejecutar(int deuda) { if (deuda > 0) { permitir(); } } }', 'Pago.java')]);
    const method = report.java.methods[0];
    const store = TestBed.inject(AnalysisSessionService); store.complete('Pago', report);
    const huawei = TestBed.inject(HuaweiAnalysisService);
    const ask = vi.spyOn(huawei, 'ask').mockResolvedValue(JSON.stringify({ resumen: 'Evalúa la deuda.', reglas: [{ modulo: 'Pagos', nombre: 'Permitir pago', descripcion: 'Si hay deuda, habilita el pago.', tipo: 'Validación', condiciones: ['La deuda es positiva'], resultado: 'Permite el pago', alternativa: null, valores_clave: [], fragmento_codigo: 'if (deuda > 0) { permitir(); }', dependencias: [], confianza: 'Media', observaciones: null }], pendientes: ['Confirmar significado de deuda.'] }));
    const fixture = TestBed.createComponent(AnalysisModuleComponent); fixture.componentRef.setInput('section', 'reglas');
    fixture.componentInstance.selectedDiscoveryMethod.set(method.id); fixture.detectChanges();
    await fixture.componentInstance.discoverBusinessRules(); fixture.detectChanges();
    const discovery = store.businessDiscoveries()[method.id]!;
    expect(discovery.reglas[0].origen).toMatchObject({ archivo: 'Pago.java', clase: 'Pago', metodo: 'ejecutar' });
    expect(fixture.nativeElement.textContent).toContain('Permitir pago');
    expect(fixture.nativeElement.textContent).toContain('Confirmar significado de deuda');
    fixture.componentInstance.setRuleStatus(discovery.reglas[0].id, 'VALIDATED');
    expect(fixture.componentInstance.approvedRules()).toHaveLength(1);
    expect(ask).toHaveBeenCalledOnce();
    ask.mockResolvedValueOnce('respuesta que no es JSON');
    await fixture.componentInstance.discoverBusinessRules();
    expect(store.businessDiscoveries()[method.id]).toBe(discovery);
    expect(store.ruleStatuses()[discovery.reglas[0].id]).toBe('VALIDATED');
    expect(fixture.componentInstance.aiError()).toContain('JSON válido');
    ask.mockRestore();
  });

  it('exports complete CSV beyond the visible page and neutralizes spreadsheet formulas', async () => {
    const fixture = TestBed.createComponent(AnalysisModuleComponent);
    fixture.componentRef.setInput('section', 'dependencias');
    const report = await exampleReport();
    report.dependencies = Array.from({ length: 31 }, (_, index) => ({ name: index === 30 ? '=HYPERLINK(fake)' : `library-${index}`, path: 'package.json', line: 0, kind: 'dependencies' }));
    TestBed.inject(AnalysisSessionService).complete('Dependencies', report);
    fixture.detectChanges();
    let exported = '';
    vi.stubGlobal('Blob', class { constructor(parts: unknown[]) { exported = parts.join(''); } });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: () => undefined });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.useFakeTimers();
    try {
      fixture.componentInstance.download('csv');
      expect(exported).toContain('library-29');
      expect(exported).toContain("'=HYPERLINK(fake)");
      expect(exported.split('\r\n')).toHaveLength(32);
      expect(click).toHaveBeenCalledOnce();
      vi.runAllTimers();
    } finally { vi.useRealTimers(); click.mockRestore(); }
  });
});
