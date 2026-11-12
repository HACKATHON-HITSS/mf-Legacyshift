import { Injectable, inject } from '@angular/core';
import { AnalysisSessionService } from './analysis-session.service';
import { HuaweiAnalysisService } from './huawei-analysis.service';
import { parseSecurityReview, SECURITY_REVIEW_PROMPT, SecurityReviewChunk, securityReviewChunks } from './security-review.agent';

@Injectable({ providedIn: 'root' })
export class SecurityReviewService {
  private readonly store = inject(AnalysisSessionService);
  private readonly huawei = inject(HuaweiAnalysisService);
  private controller: AbortController | null = null;
  private retained: { session: NonNullable<ReturnType<AnalysisSessionService['session']>>; files: readonly File[] } | null = null;

  cancel(): void { this.controller?.abort(); }
  async retry(): Promise<void> {
    if (this.retained?.session === this.store.session()) await this.start(this.retained.files);
  }

  async start(files: readonly File[]): Promise<void> {
    this.cancel();
    const controller = new AbortController(); this.controller = controller;
    const session = this.store.session();
    if (!session) return;
    this.retained = { session, files };
    const current = () => this.store.session() === session && this.controller === controller;
    const supported = /\.(?:java|kt|groovy|js|jsx|ts|tsx|py|cs|vb|sql|pks|pkb|prc|fnc|xml|wsdl|xsl|xslt|xq|xqy|xquery|proxy|pipeline|biz|bix|properties|json|ya?ml|html|sh|bat|ps1)$/i;
    const analyzed = new Set(session.report.files.filter(file => file.status === 'analyzed').map(file => file.path));
    const selected = files.filter(file => supported.test(file.name) && !/^\.env(?:\.|$)/i.test(file.name) && analyzed.has(file.webkitRelativePath || file.name));
    this.store.aiSecurityReview.set({ status: 'running', total: 0, processed: 0, succeeded: 0, files: selected.length,
      skippedFiles: files.length - selected.length, omittedLines: 0, discardedEvidence: 0, findings: [], errors: [], checkedAt: new Date().toISOString() });
    const update = (fn: (value: NonNullable<ReturnType<AnalysisSessionService['aiSecurityReview']>>) => NonNullable<ReturnType<AnalysisSessionService['aiSecurityReview']>>) => {
      if (current()) this.store.aiSecurityReview.update(value => value ? fn(value) : value);
    };
    try {
      if (!selected.length) { update(value => ({ ...value, status: 'partial', errors: ['No hay archivos de código compatibles disponibles para revisión con MaaS.'] })); return; }
      await this.huawei.refreshConnection();
      if (!current()) return;
      if (controller.signal.aborted) { update(value => ({ ...value, status: 'cancelled' })); return; }
      if (!this.huawei.connection()?.configured) {
        update(value => ({ ...value, status: 'unavailable', errors: ['Conecta Huawei MaaS desde Conectar con IA y vuelve a iniciar la revisión. El análisis local se conserva.'] }));
        return;
      }
      if (this.huawei.connection()?.model === 'mock-legacyshift') { update(value => ({ ...value, status: 'unavailable', errors: ['Huawei está en modo simulado. Configura un modelo real para obtener una revisión de seguridad con MaaS.'] })); return; }
      const chunks: SecurityReviewChunk[] = [];
      for (const file of selected) {
        if (!current() || controller.signal.aborted) break;
        try {
          const bytes = await file.arrayBuffer();
          if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('Archivo mayor de 5 MB.');
          let source: string;
          try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
          catch { source = new TextDecoder('windows-1252').decode(bytes); }
          const prepared = securityReviewChunks(source, file.webkitRelativePath || file.name);
          chunks.push(...prepared.chunks);
          update(value => ({ ...value, omittedLines: value.omittedLines + prepared.omittedLines }));
        } catch { update(value => ({ ...value, errors: [...value.errors, `${file.webkitRelativePath || file.name}: no se pudo preparar el archivo.`] })); }
      }
      update(value => ({ ...value, total: chunks.length }));
      if (!chunks.length && !controller.signal.aborted) update(value => ({ ...value, errors: [...value.errors, 'No se prepararon fragmentos revisables; no se completó una revisión de código.'] }));
      for (let index = 0; index < chunks.length; index += 2) {
        if (!current() || controller.signal.aborted) break;
        const batch = chunks.slice(index, index + 2);
        try {
          const answer = await this.huawei.ask(SECURITY_REVIEW_PROMPT, {
            agente: 'Revisor de seguridad con evidencia', proyecto: session.project, fragmentos: batch,
            alcance: 'Fragmentos parciales; no se ejecuta código ni se dispone del contexto completo. Hasta cuatro propuestas por fragmento.'
          }, { purpose: 'security', signal: controller.signal });
          if (!current() || controller.signal.aborted) break;
          const result = parseSecurityReview(answer, batch);
          update(value => {
            const merged = [...value.findings];
            const keys = new Set(merged.map(item => `${item.path}:${item.line}:${item.tipo}:${item.fragmento}`));
            for (const finding of result.findings) {
              const key = `${finding.path}:${finding.line}:${finding.tipo}:${finding.fragmento}`;
              if (!keys.has(key)) { keys.add(key); merged.push(finding); }
            }
            return { ...value, succeeded: value.succeeded + batch.length, findings: merged, discardedEvidence: value.discardedEvidence + result.discardedEvidence };
          });
        } catch (error) {
          if (controller.signal.aborted) break;
          update(value => ({ ...value, errors: [...value.errors, `${batch.map(item => item.id).join(', ')}: ${error instanceof Error ? error.message : 'Consulta fallida.'}`] }));
          if (error instanceof Error && /credencial|llave|configura|cuota|límite|contactar/i.test(error.message)) break;
        }
        update(value => ({ ...value, processed: value.processed + batch.length }));
      }
      update(value => ({ ...value, status: controller.signal.aborted ? 'cancelled' : value.errors.length || value.omittedLines || value.discardedEvidence ? 'partial' : 'complete' }));
    } catch {
      update(value => ({ ...value, status: controller.signal.aborted ? 'cancelled' : 'unavailable', errors: [...value.errors, 'No se pudo completar la revisión con MaaS. El análisis local se conserva.'] }));
    }
  }
}
