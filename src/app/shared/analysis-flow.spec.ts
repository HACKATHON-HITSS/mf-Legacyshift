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
import { JavaTestService } from './java-test.service';
import { SecurityReviewService } from './security-review.service';

async function exampleReport() {
  const file = new File(['if (amount > limit) { reject(); }'], 'Account.java');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode('if (amount > limit) { reject(); }').buffer });
  return analyzeLocalProject([file], () => undefined);
}

describe('Project analysis flow', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter(routes)] });
    vi.spyOn(TestBed.inject(SecurityReviewService), 'start').mockResolvedValue();
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); TestBed.resetTestingModule(); });

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
      expect(store.session()?.project).toBe('AccountApp');
      expect(fixture.nativeElement.textContent).not.toContain('Sin contenido.');
      expect(store.decisions()[rule.id]?.status).toBe('Aprobada');
    }
    await router.navigateByUrl('/codigo-fuente/proyecto'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-mf-project-analysis-results')).toBeNull();
    expect(store.session()?.project).toBe('AccountApp');
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
    const runJava = vi.spyOn(TestBed.inject(JavaTestService), 'runFiles').mockResolvedValue(undefined);
    const file = new File(['if (amount > limit) reject();'], 'Account.java');
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode('if (amount > limit) reject();').buffer });
    fixture.componentInstance.onFileSelected({ files: [file], value: 'Account.java' } as unknown as HTMLInputElement);
    await fixture.componentInstance.analyzeProject(); fixture.detectChanges();
    const store = TestBed.inject(AnalysisSessionService);
    expect(store.session()?.project).toBe('Account.java');
    expect(store.session()?.report.findings.some(item => item.category === 'reglas')).toBe(true);
    expect(runJava).not.toHaveBeenCalled();
    expect(TestBed.inject(SecurityReviewService).start).not.toHaveBeenCalled();
    runJava.mockRestore();
    expect(fixture.nativeElement.textContent).not.toContain('Ver matriz de reglas y resultados');
    expect(fixture.nativeElement.querySelector('app-mf-project-analysis-results')).toBeNull();
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
    report.findings.push({ id: 'security:review', category: 'vulnerabilidades', path: 'config.properties', line: 4,
      title: 'Revisar configuración sensible', condition: 'Señal pendiente de contexto', action: 'Confirmar su uso',
      evidence: 'Valor omitido', severity: 'Informativa', limitation: 'No se comprobó exposición',
      security: { ruleId: 'manual', status: 'review', checked: 'Señal pendiente de contexto', conclusion: 'Falta confirmar su uso', nextStep: 'Confirmar su uso' } });
    TestBed.inject(AnalysisSessionService).complete('Proyecto', report);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('config.properties');
    expect(fixture.nativeElement.textContent).toContain('Necesita contexto');
    expect(fixture.nativeElement.textContent).toContain('Qué se comprobó:');
    expect(fixture.nativeElement.querySelectorAll('.security-review')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.security-review details').open).toBe(false);
    fixture.componentInstance.securityStatus.set('pattern'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.security-review')).toHaveLength(0);
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
    const button = module.nativeElement.querySelector('.findings-matrix tbody tr button') as HTMLButtonElement;
    button.click(); module.detectChanges();
    const detail = module.nativeElement.querySelector('.finding-detail-row') as HTMLTableRowElement;
    expect(detail.previousElementSibling?.textContent).toContain(rule.ruleName);
    expect(detail.querySelector('.source-snippet')?.textContent).toContain(rule.snippet);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    button.click(); module.detectChanges();
    expect(module.nativeElement.querySelector('.finding-detail-row')).toBeNull();
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

  it('presents technical debt as actionable reviews with technical evidence kept in place', async () => {
    const report = await exampleReport();
    report.findings = [
      { id: 'debt:procedure', category: 'deuda-tecnica', title: 'Procedimiento configurado sin invocación directa', condition: 'sp.consultar = PKG.CONSULTAR', action: 'Seguir llamada', evidence: 'sp.consultar = PKG.CONSULTAR', severity: 'Media', path: 'app/config.properties', line: 8, limitation: 'No resuelve claves dinámicas.' },
      { id: 'debt:comment', category: 'deuda-tecnica', title: 'Pendiente declarado en comentario', condition: 'TODO', action: 'Revisar', evidence: '// TODO revisar conexión', severity: 'Media', path: 'app/Servicio.java', line: 12, limitation: 'No demuestra un defecto.' }
    ];
    TestBed.inject(AnalysisSessionService).complete('Demo', report);
    const fixture = TestBed.createComponent(AnalysisModuleComponent);
    fixture.componentRef.setInput('section', 'deuda-tecnica'); fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.debt-review');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('Por qué aparece:');
    expect(cards[0].textContent).toContain('Qué hacer');
    expect(cards[0].textContent).toContain('Pide al responsable confirmar dónde se utiliza');
    expect(cards[0].querySelector('details').open).toBe(false);
    expect(cards[0].querySelector('details').textContent).toContain('app/config.properties:8');
    expect(fixture.nativeElement.textContent).not.toContain('Reglas candidatas');
    fixture.componentInstance.debtKind.set('comment'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.debt-review')).toHaveLength(1);
    expect(fixture.componentInstance.filteredDebt()[0].id).toBe('debt:comment');
  });

  it('shows realistic simulated security results without changing the real report or calling providers', async () => {
    const store = TestBed.inject(AnalysisSessionService);
    const report = await exampleReport(); store.complete('Proyecto real', report);
    const original = store.exportData();
    const network = vi.fn(); vi.stubGlobal('fetch', network);
    const fixture = TestBed.createComponent(AnalysisModuleComponent);
    fixture.componentRef.setInput('section', 'vulnerabilidades'); fixture.detectChanges();
    fixture.componentInstance.setSecurityDemo(true); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Datos simulados.');
    expect(fixture.nativeElement.textContent).toContain('Una entrada se incorpora directamente a la consulta');
    expect(fixture.componentInstance.filteredAiSecurity()).toHaveLength(4);
    expect(fixture.componentInstance.securityItems()).toHaveLength(3);
    expect(fixture.componentInstance.javaTestResult()?.tests).toMatchObject({ tests: 24, passed: 21, failures: 2, skipped: 1 });
    expect(network).not.toHaveBeenCalled();
    expect(store.exportData()).toEqual(original);
    fixture.componentInstance.aiSecurityFilter.set('DESCARTADA'); fixture.detectChanges();
    expect(fixture.componentInstance.filteredAiSecurity()).toHaveLength(1);
    fixture.componentInstance.setSecurityDemo(false); fixture.detectChanges();
    expect(fixture.componentInstance.securityReviewResult()).toBeNull();
    expect(store.javaTests()).toBeNull();
  });

  it('prepares a migration plan with compatible selectors and invalidates it when the target changes', async () => {
    const store = TestBed.inject(AnalysisSessionService);
    store.complete('Demo', await exampleReport());
    const fixture = TestBed.createComponent(AnalysisModuleComponent);
    fixture.componentRef.setInput('section', 'arquitectura-objetivo');
    fixture.detectChanges();
    vi.useFakeTimers();
    const component = fixture.componentInstance;
    const projectName = fixture.nativeElement.querySelector('.migration-project-name input') as HTMLInputElement;
    projectName.value = '  proyecto-nuevo  ';
    projectName.dispatchEvent(new Event('input'));
    component.setMigrationTarget('javaVersion', '21');
    component.setMigrationTarget('architecture', 'microservices');
    component.setMigrationTarget('archetype', 'microservice-hexagonal');
    expect(component.migrationReady()).toBe(true);
    component.prepareMigration(); fixture.detectChanges();
    expect(component.migrationPreparing()).toBe(true);
    expect(projectName.disabled).toBe(true);
    expect(component.migrationProgress()).toBe(0);
    const dialog = fixture.nativeElement.querySelector('.migration-dialog') as HTMLDialogElement;
    expect(dialog.textContent).toContain('Procesando');
    expect(dialog.textContent).toContain('Este proceso puede tardar aproximadamente 15 segundos.');
    expect(dialog.textContent).not.toContain('Simulación');
    expect(fixture.nativeElement.textContent).not.toContain('Descargar SimcardsApp.zip');
    expect(store.migrationPlan()).toBeNull();
    vi.advanceTimersByTime(7500);
    expect(component.migrationProgress()).toBeGreaterThan(0);
    expect(component.migrationProgress()).toBeLessThan(100);
    vi.advanceTimersByTime(7000);
    expect(component.migrationProgress()).toBe(100);
    expect(component.migrationPreparing()).toBe(true);
    vi.advanceTimersByTime(500); fixture.detectChanges();
    expect(component.migrationPreparing()).toBe(false);
    expect(store.exportData().target.plan?.target.javaVersion).toBe('21');
    expect(store.exportData().target.plan?.target.projectName).toBe('proyecto-nuevo');
    expect(fixture.nativeElement.textContent).toContain('Plan preparado');
    expect(fixture.nativeElement.querySelector('.migration-plan')).toBeNull();
    let exported: Uint8Array | undefined;
    vi.stubGlobal('Blob', class { constructor(parts: Uint8Array[]) { exported = parts[0]; } });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: () => undefined });
    let filename = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
    const downloadButton = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(button => button.textContent?.includes('Descargar SimcardsApp.zip'));
    expect(downloadButton).toBeDefined();
    downloadButton!.click();
    expect(exported?.length).toBeGreaterThan(0);
    expect(filename).toBe('SimcardsApp.zip');
    expect(click).toHaveBeenCalledOnce();
    projectName.value = 'otro-proyecto';
    projectName.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(store.migrationPlan()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Descargar SimcardsApp.zip');
    component.setMigrationTarget('architecture', 'microfrontends');
    expect(store.migrationTarget().javaVersion).toBe('');
    expect(component.migrationReady()).toBe(false);
    component.setMigrationTarget('archetype', 'microfront-angular');
    expect(component.migrationReady()).toBe(true);
    component.prepareMigration();
    vi.advanceTimersByTime(15000);
    expect(store.migrationPlan()?.architectureLabel).toBe('Microfrontends');
    store.clear(); expect(store.migrationPlan()).toBeNull();
    expect(store.migrationTarget().projectName).toBe('');
  });

  it('shows HTTP verbs and routes separately from SOAP and filters the operation map', async () => {
    const { parseJavaFile, resolveJavaAnalysis } = await import('../features/codigo-fuente/proyecto/java-analysis');
    const { HTTP_ENDPOINT_AGENT } = await import('../features/codigo-fuente/proyecto/http-endpoints.agent');
    const report = await exampleReport();
    report.java = resolveJavaAnalysis([parseJavaFile('class Api { @GetMapping("/clientes") String listar() { return servicio.buscar(); } @PatchMapping("/clientes/{id}") void editar() {} }', 'Api.java')]);
    report.httpEndpoints = HTTP_ENDPOINT_AGENT.analyze(report.java);
    report.operations = [{ name: 'consultarSaldo', path: 'Servicio.wsdl', input: 'Solicitud', output: 'Respuesta' }];
    TestBed.inject(AnalysisSessionService).complete('API', report);
    const fixture = TestBed.createComponent(AnalysisModuleComponent);
    fixture.componentRef.setInput('section', 'entradas-salidas'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.endpoints-table')?.textContent).toContain('/clientes');
    expect(fixture.componentInstance.endpoints().map(item => item.verb)).toEqual(['GET', 'PATCH', 'Por confirmar']);
    fixture.componentInstance.endpointVerb.set('PATCH'); fixture.detectChanges();
    expect(fixture.componentInstance.filteredEndpoints()).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.endpoints-table')?.textContent).not.toContain('consultarSaldo');
    const button = fixture.nativeElement.querySelector('.endpoints-table tbody button') as HTMLButtonElement;
    button.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.endpoint-detail-row')?.previousElementSibling?.textContent).toContain('PATCH');
    expect(fixture.nativeElement.querySelector('.endpoint-detail-row')?.textContent).toContain('Api.java');
  });

  it('uses the plain-language agent for the selected finding and keeps its explanation attached', async () => {
    const { HuaweiAnalysisService } = await import('./huawei-analysis.service');
    const { HUMAN_EXPLANATION_AGENT } = await import('./human-explanation.agent');
    const { extractBusinessRules } = await import('../features/codigo-fuente/proyecto/business-rules');
    const report = await exampleReport();
    report.businessRules = extractBusinessRules('IF total > 0 THEN', 'regla.sql');
    const rule = report.businessRules[0];
    const store = TestBed.inject(AnalysisSessionService); store.complete('Demo', report);
    const answer = 'Qué se encontró: el código comprueba una cantidad.\n\nQué falta confirmar: no se ve la acción posterior.';
    const ask = vi.spyOn(TestBed.inject(HuaweiAnalysisService), 'ask').mockResolvedValue(answer);
    try {
      const fixture = TestBed.createComponent(AnalysisModuleComponent);
      fixture.componentRef.setInput('section', 'reglas');
      fixture.componentInstance.toggleFinding(rule.ruleId);
      await fixture.componentInstance.explainRule(); fixture.detectChanges();
      expect(HUMAN_EXPLANATION_AGENT.prompt.length).toBeLessThanOrEqual(2000);
      expect(ask).toHaveBeenCalledWith(HUMAN_EXPLANATION_AGENT.prompt, expect.objectContaining({
        agent: expect.objectContaining({ id: 'explicador-funcional' }), rule
      }));
      expect(store.ruleInterpretations()[rule.ruleId]).toBe(answer);
      expect(fixture.nativeElement.querySelector('.finding-detail')?.textContent).not.toContain('Relaciones observadas');
      expect(fixture.nativeElement.querySelector('.finding-detail')?.textContent).not.toContain('Descripción funcional asistida');
      fixture.componentInstance.ruleQuestion.set('Como funciona este hallazgo?');
      await fixture.componentInstance.askAboutRule();
      expect(ask).toHaveBeenLastCalledWith(HUMAN_EXPLANATION_AGENT.prompt, expect.objectContaining({
        pregunta: 'Como funciona este hallazgo?', rule
      }));
      expect(fixture.componentInstance.aiAnswer()).toBe(answer);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.finding-detail .answer')?.textContent).toContain(answer);
    } finally { ask.mockRestore(); }
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

  it('analyzes every method by default and continues after a failed response', async () => {
    const { parseJavaFile, resolveJavaAnalysis } = await import('../features/codigo-fuente/proyecto/java-analysis');
    const { HuaweiAnalysisService } = await import('./huawei-analysis.service');
    const report = await exampleReport();
    report.java = resolveJavaAnalysis([parseJavaFile('class Pago { void a() {} void b() {} void c() {} }', 'Pago.java')]);
    const store = TestBed.inject(AnalysisSessionService); store.complete('Global', report);
    const answer = JSON.stringify({ resumen: 'Sin reglas.', reglas: [], pendientes: [] });
    const ask = vi.spyOn(TestBed.inject(HuaweiAnalysisService), 'ask')
      .mockResolvedValueOnce(answer).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(answer);
    try {
      const fixture = TestBed.createComponent(AnalysisModuleComponent);
      fixture.componentRef.setInput('section', 'reglas'); fixture.detectChanges();
      expect(store.session()?.project).toBe('Global');
      await fixture.componentInstance.discoverBusinessRules();
      expect(ask).toHaveBeenCalledTimes(3);
      expect(Object.keys(store.businessDiscoveries())).toEqual([report.java.methods[0].id, report.java.methods[2].id]);
      expect(fixture.componentInstance.discoveryProgress()).toEqual({ completed: 3, total: 3 });
      expect(fixture.componentInstance.discovery()?.cobertura).toContain('2 de 3');
      expect(fixture.componentInstance.aiError()).toContain('offline');
    } finally { ask.mockRestore(); }
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
