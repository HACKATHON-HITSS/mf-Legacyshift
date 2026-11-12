import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AnalysisSessionService, RuleDecision, MvpRuleStatus } from './analysis-session.service';
import { ANALYSIS_SECTIONS, DECISION_SECTIONS, SectionKey } from './analysis-sections';
import { HuaweiAnalysisService } from './huawei-analysis.service';
import { redactEvidence } from '../features/codigo-fuente/proyecto/project-findings';
import { reachableMethods } from '../features/codigo-fuente/proyecto/java-analysis';
import { DISCOVERY_PROMPT, parseBusinessDiscovery } from './business-discovery';

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
  private readonly router = inject(Router);
  private readonly huawei = inject(HuaweiAnalysisService);
  readonly analysisSections = ANALYSIS_SECTIONS;
  readonly meta = computed(() => [...ANALYSIS_SECTIONS, ...DECISION_SECTIONS].find(item => item.key === this.section())!);
  readonly search = signal('');
  readonly selectedRule = signal<string | null>(null);
  readonly selectedDiscoveryMethod = signal('');
  readonly discoveryGlossary = signal('');
  readonly discoveryMethod = computed(() => this.store.session()?.report.java.methods.find(method => method.id === this.selectedDiscoveryMethod()) ?? null);
  readonly discovery = computed(() => this.store.businessDiscoveries()[this.selectedDiscoveryMethod()] ?? null);
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
      report.hardcoded.filter(item => key === 'datos-hardcodeados' || item.name.includes('sensible')).forEach((item, index) => rows.push({
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
    const method = this.discoveryMethod();
    const session = this.store.session();
    if (!method || !session || this.isAsking()) return;
    this.isAsking.set(true); this.aiError.set('');
    try {
      const result = await this.huawei.ask(DISCOVERY_PROMPT, {
        metodo: { archivo: method.path, clase: method.className, nombre: method.name, linea: method.startLine,
          fragmento: method.evidence.snippet, llamadas: method.calls.map(call => ({ nombre: call.name, receptor: call.receiver, resolucion: call.resolution })).slice(0, 30) },
        glosario: this.discoveryGlossary().slice(0, 4000),
        limitacion: 'Solo se incluye el fragmento de un método; no se dispone de implementaciones de dependencias ni tablas salvo que estén en ese fragmento.'
      });
      const discovery = parseBusinessDiscovery(result, method);
      if (this.store.session() !== session) return;
      const previous = this.store.businessDiscoveries()[method.id];
      if (previous) {
        const oldIds = new Set(previous.reglas.map(rule => rule.id));
        this.store.ruleStatuses.update(values => Object.fromEntries(Object.entries(values).filter(([id]) => !oldIds.has(id))));
        this.store.ruleNotes.update(values => Object.fromEntries(Object.entries(values).filter(([id]) => !oldIds.has(id))));
      }
      this.store.businessDiscoveries.update(values => ({ ...values, [method.id]: discovery }));
    } catch (error) {
      if (this.store.session() === session) this.aiError.set(error instanceof Error ? error.message : 'No se pudo generar el análisis.');
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
      const answer = await this.huawei.ask('Explica en lenguaje de negocio la evidencia de esta regla. Distingue hechos e hipótesis, cita su ubicación y declara la información faltante. No inventes comportamiento.', { project: session.project, rule });
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
      const answer = await this.huawei.ask(question, { project: session.project, rule, scope: 'Solo se incluye la regla seleccionada. Las dependencias observadas no prueban impacto transitivo.' });
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
    const content = JSON.stringify(this.store.exportData(), (key, value) => ['snippet', 'fragmento_codigo', 'condition', 'condiciones', 'expression', 'valor'].includes(key) ? undefined : value, 2);
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
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `legacyshift-${this.section()}.${kind}`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
