import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AnalysisSessionService, RuleDecision, MvpRuleStatus } from './analysis-session.service';
import { ANALYSIS_SECTIONS, DECISION_SECTIONS, SectionKey } from './analysis-sections';
import { HuaweiAnalysisService } from './huawei-analysis.service';
import { redactEvidence } from '../features/codigo-fuente/proyecto/project-findings';
import { reachableMethods } from '../features/codigo-fuente/proyecto/java-analysis';
import { DISCOVERY_PROMPT, parseBusinessDiscovery } from './business-discovery';
import { BusinessRule } from '../features/codigo-fuente/proyecto/business-rules';
import { HUMAN_EXPLANATION_AGENT } from './human-explanation.agent';
import { describeJavaOperation, HttpEndpoint } from '../features/codigo-fuente/proyecto/http-endpoints';
import { HTTP_ENDPOINT_AGENT } from '../features/codigo-fuente/proyecto/http-endpoints.agent';
import { presentTechnicalDebt } from './technical-debt-presentation';
import { JavaTestService } from './java-test.service';
import { SecurityReviewService } from './security-review.service';
import { createSecurityDemo } from './security-demo';

type ResultRow = { id: string; title: string; condition: string; action: string; path: string; line: number; evidence: string; scope: string };

@Component({
  selector: 'app-mf-analysis-module',
  imports: [RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './analysis-module.component.html',
  styleUrl: './analysis-module.component.css'
})
export class AnalysisModuleComponent {
  readonly section = input.required<SectionKey>();
  readonly store = inject(AnalysisSessionService);
  readonly javaTests = inject(JavaTestService);
  readonly securityReview = inject(SecurityReviewService);
  private readonly securityDemo = createSecurityDemo();
  readonly securityReviewResult = computed(() => this.store.securityDemoEnabled() ? this.securityDemo.review : this.store.aiSecurityReview());
  readonly javaTestResult = computed(() => this.store.securityDemoEnabled() ? this.securityDemo.tests : this.store.javaTests());
  readonly securityScanResult = computed(() => this.store.securityDemoEnabled() ? this.securityDemo.scan : this.store.session()?.report.securityScan);
  readonly aiSecurityFilter = signal('all');
  readonly aiSecurityPage = signal(0);
  readonly filteredAiSecurity = computed(() => (this.securityReviewResult()?.findings ?? []).filter(item => this.aiSecurityFilter() === 'all' || item.estado === this.aiSecurityFilter()));
  readonly visibleAiSecurity = computed(() => this.filteredAiSecurity().slice(this.aiSecurityPage() * 10, (this.aiSecurityPage() + 1) * 10));
  readonly aiSecurityPages = computed(() => Math.max(1, Math.ceil(this.filteredAiSecurity().length / 10)));
  private readonly router = inject(Router);
  private readonly huawei = inject(HuaweiAnalysisService);
  readonly analysisSections = ANALYSIS_SECTIONS;
  readonly meta = computed(() => [...ANALYSIS_SECTIONS, ...DECISION_SECTIONS].find(item => item.key === this.section())!);
  readonly search = signal('');
  readonly securityStatus = signal('all');
  readonly securityItems = computed(() => (this.store.securityDemoEnabled() ? this.securityDemo.local : this.store.session()?.report.findings ?? [])
    .filter(item => item.category === 'vulnerabilidades')
    .map(item => ({ ...item, fileName: item.path.split(/[\\/]/).pop() ?? item.path })));
  readonly securityPatternCount = computed(() => this.securityItems().filter(item => item.security?.status === 'pattern').length);
  readonly securityFileCount = computed(() => new Set(this.securityItems().map(item => item.path)).size);
  readonly filteredSecurity = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.securityItems().filter(item => (this.securityStatus() === 'all' || (item.security?.status ?? 'review') === this.securityStatus()) &&
      (!query || [item.title, item.path, item.action, item.security?.conclusion ?? '', item.condition].join(' ').toLocaleLowerCase().includes(query)));
  });
  readonly visibleSecurity = computed(() => this.filteredSecurity().slice(this.page() * this.pageSize, (this.page() + 1) * this.pageSize));
  readonly securityPages = computed(() => Math.max(1, Math.ceil(this.filteredSecurity().length / this.pageSize)));
  readonly debtKind = signal('all');
  readonly debtItems = computed(() => (this.store.session()?.report.findings ?? [])
    .filter(item => item.category === 'deuda-tecnica').map(item => presentTechnicalDebt(item, this.store.session()?.report.storedProcedures ?? [])));
  readonly debtFileCount = computed(() => new Set(this.debtItems().map(item => item.path)).size);
  readonly filteredDebt = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.debtItems().filter(item => (this.debtKind() === 'all' || item.kind === this.debtKind()) &&
      (!query || [item.reviewTitle, item.reason, item.nextStep, item.condition, item.path, item.evidence].join(' ').toLocaleLowerCase().includes(query)));
  });
  readonly visibleDebt = computed(() => this.filteredDebt().slice(this.page() * this.pageSize, (this.page() + 1) * this.pageSize));
  readonly debtPages = computed(() => Math.max(1, Math.ceil(this.filteredDebt().length / this.pageSize)));
  readonly endpointVerb = signal('all');
  readonly selectedEndpoint = signal('');
  readonly endpointAnswers = signal<Record<string, string>>({});
  readonly endpoints = computed(() => {
    const report = this.store.session()?.report;
    if (!report) return [];
    const http = (report.httpEndpoints ?? HTTP_ENDPOINT_AGENT.analyze(report.java)).map(item => ({ ...item, protocol: 'HTTP' }));
    const soap = report.operations.map((item, index) => {
      const matches = report.java.methods.filter(method => method.name === item.name || method.annotationSources?.some(annotation => /@(?:[\w.]+\.)?WebMethod\b/.test(annotation) && annotation.includes(`"${item.name}"`)));
      const method = matches.length === 1 ? matches[0] : null;
      return {
        id: `wsdl:${index}`, protocol: 'SOAP', verb: 'Por confirmar', route: item.name, operation: item.name,
        description: method ? describeJavaOperation(method) : 'Declara una operación SOAP que recibe una solicitud y entrega una respuesta. Su función interna no se puede confirmar solo con el contrato.',
        input: item.input, output: item.output, path: item.path, line: 0,
        scope: 'Contrato WSDL. El método HTTP y los campos de los mensajes requieren revisar el binding y los esquemas.'
      };
    });
    const other = report.findings.filter(item => item.category === 'entradas-salidas' &&
      !(item.title === 'Entrada HTTP declarada' && http.some(endpoint => endpoint.path === item.path)))
      .map(item => ({
        id: item.id, protocol: item.title === 'Entrada HTTP declarada' ? 'HTTP' : 'Datos',
        verb: item.title === 'Entrada HTTP declarada' ? 'Por confirmar' : 'No aplica',
        route: item.title, operation: item.title, description: item.action,
        input: item.condition, output: 'Por confirmar', path: item.path, line: item.line, scope: item.limitation
      }));
    return [...http, ...soap, ...other];
  });
  readonly filteredEndpoints = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.endpoints().filter(item => (this.endpointVerb() === 'all' || item.verb === this.endpointVerb() || item.protocol === this.endpointVerb()) &&
      (!query || [item.verb, item.protocol, item.route, item.operation, item.description, item.path, item.input, item.output].join(' ').toLocaleLowerCase().includes(query)));
  });
  readonly visibleEndpoints = computed(() => this.filteredEndpoints().slice(this.page() * this.pageSize, (this.page() + 1) * this.pageSize));
  readonly endpointPages = computed(() => Math.max(1, Math.ceil(this.filteredEndpoints().length / this.pageSize)));
  readonly selectedRule = signal<string | null>(null);
  readonly selectedDiscoveryMethod = signal('');
  readonly discoveryProgress = signal({ completed: 0, total: 0 });
  readonly discoveryGlossary = signal('');
  readonly discoveryFilter = signal('all');
  readonly discoverySearch = signal('');
  readonly discoveryPage = signal(0);
  readonly discoveryResults = computed(() => {
    const values = this.store.businessDiscoveries();
    return (this.store.session()?.report.java.methods ?? [])
      .filter(method => !this.selectedDiscoveryMethod() || method.id === this.selectedDiscoveryMethod())
      .flatMap(method => {
        const result = values[method.id];
        return result ? [{ method, result }] : [];
      })
      .sort((a, b) => a.method.path.localeCompare(b.method.path) || a.method.startLine - b.method.startLine);
  });
  readonly discoveryStats = computed(() => {
    const results = this.discoveryResults();
    return {
      methods: results.length,
      rules: results.reduce((total, item) => total + item.result.reglas.length, 0),
      pending: results.reduce((total, item) => total + item.result.pendientes.length, 0)
    };
  });
  readonly filteredDiscoveries = computed(() => {
    const query = this.discoverySearch().trim().toLocaleLowerCase();
    return this.discoveryResults().filter(({ method, result }) =>
      (!query || [method.className, method.name, method.path, result.resumen, ...result.pendientes].join(' ').toLocaleLowerCase().includes(query)) &&
      (this.discoveryFilter() === 'all' ||
        (this.discoveryFilter() === 'rules' && result.reglas.length > 0) ||
        (this.discoveryFilter() === 'pending' && result.pendientes.length > 0) ||
        (this.discoveryFilter() === 'empty' && result.reglas.length === 0)));
  });
  readonly visibleDiscoveries = computed(() => this.filteredDiscoveries().slice(this.discoveryPage() * 10, (this.discoveryPage() + 1) * 10));
  readonly discoveryPages = computed(() => Math.max(1, Math.ceil(this.filteredDiscoveries().length / 10)));
  readonly discoveryMethod = computed(() => this.store.session()?.report.java.methods.find(method => method.id === this.selectedDiscoveryMethod()) ?? null);
  readonly discovery = computed(() => {
    if (this.selectedDiscoveryMethod()) return this.store.businessDiscoveries()[this.selectedDiscoveryMethod()] ?? null;
    const results = Object.values(this.store.businessDiscoveries()).filter(value => value !== undefined);
    if (!results.length) return null;
    return {
      resumen: results.map(value => value.resumen).join('\n'),
      reglas: results.flatMap(value => value.reglas),
      pendientes: results.flatMap(value => value.pendientes.map(item => `${value.methodId}: ${item}`)),
      cobertura: `${results.length} de ${this.store.session()?.report.java.methods.length ?? 0} métodos con resultado. Se revisa el fragmento disponible (hasta 2.000 caracteres por método); dependencias externas y código restante requieren revisión.`,
      discarded: results.reduce((total, value) => total + value.discarded, 0)
    };
  });
  readonly selectedFlow = signal<string>('');
  readonly selectedJavaEntry = signal('');
  readonly selectedJavaMethod = signal('');
  readonly javaEntries = computed(() => this.store.session()?.report.java.methods.filter(method => method.entryPoint) ?? []);
  readonly javaEntry = computed(() => this.javaEntries().find(method => method.id === this.selectedJavaEntry()) ?? this.javaEntries()[0] ?? null);
  readonly javaReachable = computed(() => {
    const session = this.store.session(); const entry = this.javaEntry();
    return session && entry ? reachableMethods(session.report.java, entry.id) : [];
  });
  readonly javaMethod = computed(() => this.javaReachable().find(item => item.method.id === this.selectedJavaMethod())?.method ?? this.javaEntry());
  readonly javaMethodIndex = computed(() => new Map((this.store.session()?.report.java.methods ?? []).map(method => [method.id, method])));
  readonly currentFlow = computed(() => {
    const flows = this.store.session()?.report.processFlows ?? [];
    return flows.find(flow => flow.id === this.selectedFlow()) ?? flows[0] ?? null;
  });
  readonly ruleQuestion = signal('');
  readonly matrixRules = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return (this.store.session()?.report.businessRules ?? []).filter(rule => !query || [rule.ruleId, rule.ruleName, rule.ruleType, rule.component, rule.path, ...rule.dependencies].join(' ').toLocaleLowerCase().includes(query));
  });
  readonly currentRule = computed(() => this.store.session()?.report.businessRules.find(rule => rule.ruleId === this.selectedRule()) ?? null);
  readonly visibleMatrixRules = computed(() => this.matrixRules().slice(this.page() * this.pageSize, (this.page() + 1) * this.pageSize));
  readonly matrixPages = computed(() => Math.max(1, Math.ceil(this.matrixRules().length / this.pageSize)));
  readonly page = signal(0);
  readonly pageSize = 25;
  readonly question = signal('');
  readonly isAsking = signal(false);
  readonly aiAnswer = signal('');
  readonly aiError = signal('');
  readonly approvedRules = computed(() => [
    ...(this.store.session()?.report.businessRules ?? []).filter(rule => this.store.ruleStatuses()[rule.ruleId] === 'VALIDATED')
      .map(rule => ({ ...rule, id: rule.ruleId, line: rule.startLine ?? 0 })),
    ...Object.values(this.store.businessDiscoveries()).flatMap(discovery => discovery?.reglas ?? [])
      .filter(rule => this.store.ruleStatuses()[rule.id] === 'VALIDATED')
      .map(rule => ({ ...rule, condition: rule.condiciones.join('; '), path: rule.origen.archivo, line: rule.origen.linea }))
  ]);
  readonly ruleCount = computed(() => (this.store.session()?.report.businessRules.length ?? 0) + Object.values(this.store.businessDiscoveries()).reduce((total, discovery) => total + (discovery?.reglas.length ?? 0), 0));
  readonly hardcodedFiles = computed(() => {
    const counts = new Map<string, number>();
    for (const item of this.store.session()?.report.hardcoded ?? []) counts.set(item.path, (counts.get(item.path) ?? 0) + 1);
    return [...counts].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
  });
  readonly roles = computed(() => {
    const counts = new Map<string, number>();
    for (const file of this.store.session()?.report.files ?? []) {
      if (file.status === 'analyzed') counts.set(file.role, (counts.get(file.role) ?? 0) + 1);
    }
    return [...counts].map(([name, count]) => ({ name, count }));
  });
  readonly countHighRisks = computed(() => (this.rows().filter(r => r.scope.startsWith('Alta')) ?? []).length);
  readonly countMediumRisks = computed(() => (this.rows().filter(r => r.scope.startsWith('Media')) ?? []).length);
  readonly countInfoRisks = computed(() => (this.rows().filter(r => r.scope.startsWith('Informativa')) ?? []).length);
  readonly vulnerabilityFileCount = computed(() => new Set(this.rows().map(row => row.path)).size);
  readonly rows = computed<ResultRow[]>(() => {
    const report = this.store.session()?.report;
    if (!report) return [];
    const key = this.section();
    const findings = report.findings.filter(item => item.category === (key === 'aprobar-reglas' ? 'reglas' : key));
    const rows: ResultRow[] = findings.map(item => ({ ...item, scope: `${item.severity}. ${item.limitation}` }));
    if (key === 'datos-hardcodeados' || key === 'vulnerabilidades') {
      report.hardcoded.filter(item => key === 'datos-hardcodeados' || (!report.securityScan && item.name.includes('sensible'))).forEach((item, index) => rows.push({
        id: `literal:${index}`, title: item.name, condition: 'Valor literal detectado', action: 'Revisar configuración y contexto', path: item.path, line: item.line, evidence: 'Valor omitido', scope: item.kind
      }));
    }
    if (key === 'entradas-salidas') report.operations.forEach((item, index) => rows.push({
      id: `wsdl:${index}`, title: item.name, condition: item.input, action: item.output, path: item.path, line: 0, evidence: 'Contrato WSDL 1.1', scope: 'Mensaje declarado; esquema no resuelto'
    }));
    if (key === 'dependencias') [...report.dependencies, ...report.imports].forEach((item, index) => rows.push({
      id: `dependency:${index}`, title: item.name, condition: item.kind, action: 'Evaluar compatibilidad y uso antes de migrar', path: item.path, line: item.line, evidence: 'Declaración observada', scope: 'Migración pendiente de evaluación; no resuelve transitivas'
    }));
    if (key === 'arquitectura') report.files.filter(item => item.status === 'analyzed').forEach((item, index) => rows.push({
      id: `file:${index}`, title: item.role, condition: item.language, action: `${item.lines} líneas`, path: item.path, line: 0, evidence: 'Clasificación estimada por ruta y extensión', scope: item.detail || 'Sin relaciones de llamadas verificadas'
    }));
    return rows;
  });
  readonly filtered = computed(() => {
    const search = this.search().trim().toLocaleLowerCase();
    return this.rows().filter(row => !search || [row.title, row.condition, row.action, row.path].join(' ').toLocaleLowerCase().includes(search));
  });
  readonly visible = computed(() => this.filtered().slice(this.page() * this.pageSize, (this.page() + 1) * this.pageSize));
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly isTable = computed(() => !['tecnologia', 'arquitectura-objetivo', 'chat', 'exportar'].includes(this.section()));

  link(path: string): string {
    // Preserve the host shell's remote mount prefix, e.g. /legacyshift/analisis/reglas.
    const prefix = this.router.url.split(/[?#]/)[0].split(/\/(?:codigo-fuente|analisis|decisiones)(?:\/|$)/)[0];
    return `${prefix}/${path}`;
  }

  filter(value: string): void { this.search.set(value); this.page.set(0); }
  setSecurityDemo(enabled: boolean): void {
    if (enabled && this.store.aiSecurityReview()?.status === 'running') this.securityReview.cancel();
    this.store.securityDemoEnabled.set(enabled);
    this.aiSecurityFilter.set('all'); this.aiSecurityPage.set(0); this.securityStatus.set('all'); this.filter('');
  }
  downloadSecurityDemo(): void {
    const url = URL.createObjectURL(new Blob([JSON.stringify(this.securityDemo, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'legacyshift-seguridad-DEMO.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  async explainEndpoint(endpoint: HttpEndpoint): Promise<void> {
    const session = this.store.session();
    if (!session || this.isAsking()) return;
    const candidates = session.report.java.methods.filter(item => endpoint.id.startsWith(`http:${item.id}:`) ||
      (endpoint.id.startsWith('wsdl:') && item.name === endpoint.operation));
    const method = candidates.length === 1 ? candidates[0] : null;
    this.isAsking.set(true); this.aiError.set('');
    try {
      const answer = await this.huawei.ask(HUMAN_EXPLANATION_AGENT.prompt, {
        pregunta: '¿Qué hace esta operación? Explica solo su comportamiento demostrado. Un nombre no confirma su propósito.',
        endpoint, metodo: method ?? null
      });
      if (this.store.session() === session) this.endpointAnswers.update(values => ({ ...values, [endpoint.id]: answer }));
    } catch (error) {
      if (this.store.session() === session) this.aiError.set(error instanceof Error ? error.message : 'No se pudo explicar la operación.');
    } finally { this.isAsking.set(false); }
  }
  downloadEndpoints(): void {
    const rows = this.filteredEndpoints();
    const escape = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
    const content = [['Protocolo', 'Método HTTP', 'Ruta / operación', 'Qué hace', 'Entrada', 'Salida', 'Archivo', 'Línea', 'Alcance'],
      ...rows.map(item => [item.protocol, item.verb, item.route, item.description, item.input, item.output, item.path, String(item.line || ''), item.scope])]
      .map(row => row.map(escape).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'legacyshift-entradas-salidas.csv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  toggleFinding(id: string): void {
    this.selectedRule.set(this.selectedRule() === id ? null : id);
    this.aiAnswer.set('');
    this.aiError.set('');
    this.ruleQuestion.set('');
  }
  findingObservation(rule: BusinessRule): { label: string; reason: string } {
    if (rule.ruleType === 'OTHER' && /\bnull\b/.test(rule.condition)) {
      return { label: 'Comprobación de valor nulo', reason: 'Aparece porque el código compara un valor con null. Revisar si corresponde a una validación técnica o de negocio.' };
    }
    const descriptions: Record<BusinessRule['ruleType'], { label: string; reason: string }> = {
      OTHER: { label: 'Condición por revisar', reason: 'Se detectó una condición de control. Su propósito de negocio aún no está confirmado.' },
      VALIDATION: { label: 'Validación detectada', reason: 'Se detectó una validación en el código o la configuración. Confirmar qué requisito verifica.' },
      CALCULATION: { label: 'Cálculo detectado', reason: 'Se identificó una operación de cálculo. Revisar su fórmula y significado de negocio.' },
      AUTHORIZATION: { label: 'Control de autorización', reason: 'Se identificó un control de acceso. Confirmar los permisos y restricciones aplicables.' },
      ROUTING: { label: 'Enrutamiento detectado', reason: 'Se detectó una configuración de destino o enrutamiento. Revisar cuándo y hacia dónde dirige la solicitud.' },
      TRANSFORMATION: { label: 'Transformación de datos', reason: 'Se detectó una transformación o mapeo. Confirmar qué datos modifica y con qué propósito.' },
      QUERY: { label: 'Operación de datos', reason: 'Se detectó una consulta o modificación de datos. Revisar su efecto y las condiciones que la gobiernan.' },
      ERROR_HANDLING: { label: 'Manejo de error', reason: 'Se detectó una instrucción o configuración de manejo de errores. Confirmar su efecto sobre el proceso.' },
      STATE_TRANSITION: { label: 'Cambio de estado', reason: 'Se identificó una transición de estado. Confirmar sus condiciones y los estados permitidos.' }
    };
    return descriptions[rule.ruleType];
  }
  vulnerabilitySeverity(scope: string): string {
    if (scope.startsWith('Alta.')) return 'Prioridad estimada: alta';
    if (scope.startsWith('Media.')) return 'Prioridad estimada: media';
    if (scope.startsWith('Informativa.')) return 'Informativo';
    return 'Prioridad sin clasificar';
  }
  setRuleStatus(id: string, status: string): void {
    const known = this.store.session()?.report.businessRules.some(rule => rule.ruleId === id) || Object.values(this.store.businessDiscoveries()).some(discovery => discovery?.reglas.some(rule => rule.id === id));
    if (['PENDING', 'VALIDATED', 'REJECTED', 'UNDER_INVESTIGATION'].includes(status) && known) {
      this.store.ruleStatuses.update(values => ({ ...values, [id]: status as MvpRuleStatus }));
    }
  }
  setRuleNote(id: string, note: string): void {
    const known = this.store.session()?.report.businessRules.some(rule => rule.ruleId === id) || Object.values(this.store.businessDiscoveries()).some(discovery => discovery?.reglas.some(rule => rule.id === id));
    if (known) this.store.ruleNotes.update(values => ({ ...values, [id]: note.slice(0, 1000) }));
  }

  async discoverBusinessRules(): Promise<void> {
    const session = this.store.session();
    const methods = this.selectedDiscoveryMethod() ? [this.discoveryMethod()].filter(method => method !== null) : session?.report.java.methods ?? [];
    if (!session || !methods.length || this.isAsking()) return;
    const glossary = this.discoveryGlossary().slice(0, 4000);
    this.isAsking.set(true); this.aiError.set('');
    this.discoveryProgress.set({ completed: 0, total: methods.length });
    const failures: string[] = [];
    try {
      for (const method of methods) {
        if (this.store.session() !== session) return;
        try {
          const result = await this.huawei.ask(DISCOVERY_PROMPT, {
            agente: 'Analista global de reglas de negocio',
            proyecto: session.project,
            metodo: { archivo: method.path, clase: method.className, nombre: method.name, linea: method.startLine,
              fragmento: method.evidence.snippet, llamadas: method.calls.map(call => ({ nombre: call.name, receptor: call.receiver, resolucion: call.resolution })).slice(0, 30) },
            glosario: glossary,
            limitacion: 'Recorrido global por métodos. Esta consulta incluye solo el fragmento de este método (hasta 2.000 caracteres); no infieras implementaciones de dependencias ausentes.'
          });
          if (this.store.session() !== session) return;
          const discovery = parseBusinessDiscovery(result, method);
          const previous = this.store.businessDiscoveries()[method.id];
          if (previous) {
            const oldIds = new Set(previous.reglas.map(rule => rule.id));
            this.store.ruleStatuses.update(values => Object.fromEntries(Object.entries(values).filter(([id]) => !oldIds.has(id))));
            this.store.ruleNotes.update(values => Object.fromEntries(Object.entries(values).filter(([id]) => !oldIds.has(id))));
          }
          this.store.businessDiscoveries.update(values => ({ ...values, [method.id]: discovery }));
        } catch (error) {
          if (this.store.session() !== session) return;
          failures.push(`${method.path}:${method.startLine} · ${method.name}: ${error instanceof Error ? error.message : 'No se pudo generar el análisis.'}`);
        }
        this.discoveryProgress.update(value => ({ ...value, completed: value.completed + 1 }));
      }
      if (failures.length) this.aiError.set(`M?todos pendientes por error (${failures.length}): ${failures.join('\n')}`);
    } finally { this.isAsking.set(false); }
  }

  downloadDiscovery(): void {
    const discovery = this.discovery();
    if (!discovery) return;
    const content = JSON.stringify({ resumen: discovery.resumen, reglas: discovery.reglas.map(({ methodId: _methodId, ...rule }) => ({ ...rule,
      estado_validacion: this.store.ruleStatuses()[rule.id] ?? 'UNDER_INVESTIGATION', observacion_revision: this.store.ruleNotes()[rule.id] ?? '' })),
      pendientes: discovery.pendientes, cobertura: discovery.cobertura }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'legacyshift-reglas-negocio.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async explainRule(): Promise<void> {
    const rule = this.currentRule();
    const session = this.store.session();
    if (!rule || !session || this.isAsking()) return;
    this.isAsking.set(true); this.aiError.set('');
    try {
      const answer = await this.huawei.ask(HUMAN_EXPLANATION_AGENT.prompt, {
        agent: { id: HUMAN_EXPLANATION_AGENT.id, name: HUMAN_EXPLANATION_AGENT.name },
        project: session.project, rule, observation: this.findingObservation(rule)
      });
      if (this.store.session() === session) this.store.ruleInterpretations.update(values => ({ ...values, [rule.ruleId]: answer }));
    } catch (error) { if (this.store.session() === session) this.aiError.set(error instanceof Error ? error.message : 'No se pudo consultar Huawei.'); }
    finally { this.isAsking.set(false); }
  }

  async askAboutRule(): Promise<void> {
    const rule = this.currentRule();
    const question = this.ruleQuestion().trim();
    const session = this.store.session();
    if (!rule || !question || !session || this.isAsking()) return;
    this.isAsking.set(true); this.aiError.set(''); this.aiAnswer.set('');
    try {
      const answer = await this.huawei.ask(HUMAN_EXPLANATION_AGENT.prompt, {
        agent: { id: HUMAN_EXPLANATION_AGENT.id, name: HUMAN_EXPLANATION_AGENT.name },
        pregunta: question, project: session.project, rule,
        scope: 'Solo se incluye el hallazgo seleccionado; no se demuestra impacto en otros componentes.'
      });
      if (this.store.session() === session && this.selectedRule() === rule.ruleId) this.aiAnswer.set(answer);
    } catch (error) { this.aiError.set(error instanceof Error ? error.message : 'No se pudo consultar Huawei.'); }
    finally { this.isAsking.set(false); }
  }
  async explainJavaFlow(): Promise<void> {
    const session = this.store.session(); const entry = this.javaEntry();
    if (!session || !entry || this.isAsking()) return;
    this.isAsking.set(true); this.aiError.set(''); this.aiAnswer.set('');
    try {
      const nodes = this.javaReachable().slice(0, 15).map(item => ({ ...item, method: { ...item.method, evidence: { ...item.method.evidence, snippet: item.method.evidence.snippet.slice(0, 500) }, calls: item.method.calls.slice(0, 10).map(call => ({ ...call, evidence: { ...call.evidence, snippet: call.evidence.snippet.slice(0, 150) } })), conditions: item.method.conditions.slice(0, 5).map(condition => ({ ...condition, evidence: { ...condition.evidence, snippet: condition.evidence.snippet.slice(0, 150) } })) } }));
      const answer = await this.huawei.ask('Explica este grafo Java citando archivos y líneas. Distingue llamadas observadas, destinos inferidos y no resueltos. No supongas que todas las ramas se ejecutan juntas.', { entry: entry.id, nodes, scope: 'Hasta 15 métodos; recorrido limitado a 8 niveles. No es un flujo completo de ejecución.' });
      if (this.store.session() === session && this.javaEntry()?.id === entry.id) this.aiAnswer.set(answer);
    } catch (error) { if (this.store.session() === session) this.aiError.set(error instanceof Error ? error.message : 'No se pudo consultar Huawei.'); }
    finally { this.isAsking.set(false); }
  }

  downloadJavaMermaid(): void {
    const graph = this.javaReachable();
    if (!graph.length) return;
    const ids = new Map(graph.map((item, index) => [item.method.id, `n${index}`]));
    const clean = (value: string) => value.replace(/["\r\n<>]/g, ' ').slice(0, 120);
    const lines = ['flowchart TD', '%% Destinos inferidos a partir de tipos declarados; no representa orden de ejecución.'];
    for (const item of graph) lines.push(`  ${ids.get(item.method.id)}["${clean(item.method.className)}.${clean(item.method.name)}"]`);
    for (const item of graph) for (const call of item.method.calls) if (call.target && ids.has(call.target)) lines.push(`  ${ids.get(item.method.id)} -. "${clean(call.name)}: INFERRED" .-> ${ids.get(call.target)}`);
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'legacyshift-flujo-java.mmd'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  downloadSafeJson(): void {
    if (!this.store.session()) return;
    const content = JSON.stringify(this.store.exportData(), (key, value) => ['snippet', 'fragmento_codigo', 'fragmento', 'fragmento_proteccion', 'condition', 'condiciones', 'expression', 'valor'].includes(key) ? undefined : value, 2);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'legacyshift-informe-sin-fragmentos.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  decide(id: string, value: string, note: string): void {
    if (['Pendiente', 'Aprobada', 'Descartada'].includes(value)) this.store.decide(id, value as RuleDecision, note.slice(0, 1000));
  }

  async askHuawei(): Promise<void> {
    if (this.isAsking()) return;
    const session = this.store.session();
    const question = this.section() === 'chat' ? this.question().trim() : `Explica los hallazgos del módulo ${this.meta().title}, su impacto y los siguientes pasos. No inventes información ausente.`;
    if (!session || !question) return;
    this.isAsking.set(true); this.aiError.set(''); this.aiAnswer.set('');
    const current = session;
    try {
      const questionTerms = question.toLowerCase().split(/\s+/).filter(term => term.length > 3);
      const available = this.section() === 'chat' ? session.report.findings.map(item => ({ ...item, scope: item.limitation })) : this.rows();
      const ranked = this.section() === 'chat' ? [...available].sort((a, b) => {
        const score = (item: typeof a) => questionTerms.filter(term => JSON.stringify(item).toLowerCase().includes(term)).length;
        return score(b) - score(a);
      }) : available;
      // Keep requests bounded; display the exact subset limit in the UI.
      const javaCandidates = this.selectedJavaEntry() && this.section() === 'chat'
        ? reachableMethods(session.report.java, this.selectedJavaEntry()).map(item => item.method)
        : [...session.report.java.methods].sort((a, b) => {
          const score = (method: typeof a) => questionTerms.filter(term => `${method.className} ${method.name} ${method.path}`.toLowerCase().includes(term)).length;
          return score(b) - score(a);
        });
      const context = { project: session.project, module: this.meta().title,
        coverage: { analyzed: session.report.analyzed, skipped: session.report.skipped, errors: session.report.errors },
        totalFindings: available.length, included: ranked.slice(0, 30),
        dependencies: session.report.dependencies.slice(0, 15),
        targetTechnology: this.store.technology(), approvedRules: this.approvedRules().slice(0, 10),
        javaMethods: this.section() === 'chat' ? javaCandidates.slice(0, 10).map(method => ({ ...method, evidence: { ...method.evidence, snippet: '' }, calls: method.calls.slice(0, 10).map(call => ({ ...call, evidence: { ...call.evidence, snippet: '' } })), conditions: method.conditions.slice(0, 5).map(condition => ({ ...condition, evidence: { ...condition.evidence, snippet: '' } })) })) : []
      };
      const answer = await this.huawei.ask(redactEvidence(question), context);
      if (this.store.session() !== current) return;
      this.aiAnswer.set(answer);
      if (this.section() === 'chat') {
        this.store.messages.update(value => [...value, { question, answer }]);
        this.question.set('');
      }
    } catch (error) {
      if (this.store.session() === current) this.aiError.set(error instanceof Error ? error.message : 'La consulta no pudo completarse.');
    } finally { this.isAsking.set(false); }
  }

  download(kind: 'json' | 'csv' | 'md'): void {
    const session = this.store.session();
    if (!session) return;
    let content: string;
    if (kind === 'json') content = JSON.stringify(this.store.exportData(), null, 2);
    else if (kind === 'csv') {
      const source = this.section() === 'exportar' ? session.report.findings.filter(item => item.category === 'reglas').map(item => ({ ...item, scope: item.limitation })) : this.rows();
      // Prevent spreadsheet formulas from being executed when opening a CSV.
      const csv = (value: string | number) => `"${String(value).replace(/^[\s]*[=+@-]/, match => `'${match}`).replace(/"/g, '""')}"`;
      const data = this.section() === 'reglas' || this.section() === 'exportar'
        ? [['ruleId', 'ruleName', 'businessDescription', 'ruleType', 'condition', 'result', 'inputs', 'outputs', 'componentId', 'componentType', 'dependencies', 'evidenceId', 'artifactPath', 'artifactType', 'locationType', 'startLine', 'endLine', 'xmlNodePath', 'discoveryMethod', 'validationStatus', 'observations', 'limitations', 'artifactHash', 'artifactVersion', 'createdAt'], ...(session.report.businessRules ?? []).map(rule => [rule.ruleId, rule.ruleName, this.store.ruleInterpretations()[rule.ruleId] ?? rule.businessDescription, rule.ruleType, rule.condition, rule.result, rule.inputs.join('; '), rule.outputs.join('; '), rule.componentId, rule.componentType, rule.dependencies.join('; '), rule.evidenceId, rule.path, rule.artifactType, rule.locationType, rule.startLine ?? '', rule.endLine ?? '', rule.xmlNodePath, rule.discoveryMethod, this.store.ruleStatuses()[rule.ruleId] ?? 'UNDER_INVESTIGATION', this.store.ruleNotes()[rule.ruleId] ?? '', rule.limitations, rule.artifactHash ?? '', rule.artifactVersion ?? '', rule.createdAt])]
        : this.section() === 'vulnerabilidades'
        ? [['Origen', 'Qué revisar', 'Comprobación', 'Qué se comprobó', 'Qué significa', 'Qué hacer', 'Archivo', 'Línea', 'Prioridad estimada', 'Límites'], ...this.filteredSecurity().map(item => [this.store.securityDemoEnabled() ? 'DATOS SIMULADOS' : 'Detector local', item.title, item.security?.status === 'pattern' ? 'Patrón comprobado' : 'Necesita contexto', item.security?.checked ?? item.condition, item.security?.conclusion ?? 'Pendiente de validación', item.security?.nextStep ?? item.action, item.path, item.line, item.severity, item.limitation])]
        : this.section() === 'deuda-tecnica'
        ? [['Qué revisar', 'Tipo', 'Por qué aparece', 'Qué hacer', 'Archivo', 'Línea', 'Detalle detectado', 'Evidencia', 'Alcance'], ...this.filteredDebt().map(item => [item.reviewTitle, item.label, item.reason, item.nextStep, item.path, item.line, item.condition, item.evidence, item.limitation])]
        : this.section() === 'datos-hardcodeados'
        ? [['Archivo', 'Línea', 'Tipo de hallazgo'], ...source.map(row => [row.path, row.line || '', row.title])]
        : [['ID', 'Hallazgo', 'Condición / entrada', 'Acción / salida', 'Archivo', 'Línea', 'Estado', 'Observación', 'Alcance'], ...source.map(row => [row.id, row.title, row.condition, row.action, row.path, row.line || '', this.store.decisions()[row.id]?.status ?? 'Pendiente', this.store.decisions()[row.id]?.note ?? '', row.scope])];
      if (this.section() === 'reglas' || this.section() === 'exportar') {
        for (const discovery of Object.values(this.store.businessDiscoveries())) for (const rule of discovery?.reglas ?? []) {
          data.push([rule.id, rule.nombre, rule.descripcion, rule.tipo, rule.condiciones.join('; '), rule.resultado, '', '', `${rule.origen.archivo}#${rule.origen.clase}.${rule.origen.metodo}`, 'Método Java', rule.dependencias.join('; '), '', rule.origen.archivo, 'JAVA', 'LINE', rule.origen.linea, '', '', 'IA con evidencia verificada', this.store.ruleStatuses()[rule.id] ?? 'UNDER_INVESTIGATION', this.store.ruleNotes()[rule.id] ?? '', `Confianza propuesta: ${rule.confianza}. ${rule.observaciones ?? ''}`, '', '', discovery!.generatedAt]);
        }
      }
      content = '\uFEFF' + data.map(row => row.map(csv).join(',')).join('\r\n');
    } else {
      content = [`# Análisis de ${session.project}`, `Fecha: ${session.completedAt}`,
        `Analizados: ${session.report.analyzed}; omitidos: ${session.report.skipped}; errores: ${session.report.errors}.`,
        'Análisis local por patrones. Candidatos pendientes de revisión; no demuestra ausencia de riesgos.',
        ...ANALYSIS_SECTIONS.map(section => `## ${section.title}\n${section.description}\n` +
          session.report.findings.filter(item => item.category === section.key).map(item => `- ${item.id}: ${item.title}\n  Condición: ${item.condition}\n  Acción: ${item.action}\n  Fuente: ${item.path}:${item.line}\n  Estado: ${this.store.decisions()[item.id]?.status ?? 'Pendiente'}\n  Observación: ${this.store.decisions()[item.id]?.note ?? ''}`).join('\n')),
        '## Datos hardcodeados', ...session.report.hardcoded.map(item => `- ${item.name}: ${item.path}:${item.line}. ${item.kind}`),
        '## Contratos WSDL', ...session.report.operations.map(item => `- ${item.name}: ${item.input} → ${item.output} (${item.path})`),
        '## Dependencias e imports', ...[...session.report.dependencies, ...session.report.imports].map(item => `- ${item.name} (${item.path}:${item.line}). ${item.kind}`),
        '## Inventario de arquitectura', ...session.report.files.map(file => `- ${file.path}: ${file.role}, ${file.language}, ${file.status}. ${file.detail}`),
        '## Decisiones de destino', `Tecnología: ${this.store.technology() || 'Sin seleccionar'}`, this.store.technologyReason(),
        `Reglas aprobadas: ${this.approvedRules().length} de ${this.ruleCount()}.`,
        'Arquitectura objetivo: borrador de entradas → aplicación → reglas aprobadas → adaptadores; requiere diseño y validación.'
      ].join('\n\n');
    }
    const mime = { json: 'application/json', csv: 'text/csv;charset=utf-8', md: 'text/markdown;charset=utf-8' }[kind];
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `legacyshift-${this.section()}${this.section() === 'vulnerabilidades' && this.store.securityDemoEnabled() && kind === 'csv' ? '-DEMO' : ''}.${kind}`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
