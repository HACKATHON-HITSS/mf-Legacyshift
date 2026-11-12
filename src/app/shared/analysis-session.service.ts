import { Injectable, signal } from '@angular/core';
import { LocalAnalysisReport } from '../features/codigo-fuente/proyecto/local-project-analyzer';
import { BusinessDiscovery } from './business-discovery';

export type RuleDecision = 'Pendiente' | 'Aprobada' | 'Descartada';
export type MvpRuleStatus = 'PENDING' | 'VALIDATED' | 'REJECTED' | 'UNDER_INVESTIGATION';
export type AnalysisSession = { project: string; completedAt: string; report: LocalAnalysisReport };

@Injectable({ providedIn: 'root' })
export class AnalysisSessionService {
  private generation = 0;
  get revision(): number { return this.generation; }
  readonly session = signal<AnalysisSession | null>(null);
  readonly decisions = signal<Record<string, { status: RuleDecision; note: string }>>({});
  readonly ruleStatuses = signal<Partial<Record<string, MvpRuleStatus>>>({});
  readonly ruleNotes = signal<Partial<Record<string, string>>>({});
  readonly ruleInterpretations = signal<Partial<Record<string, string>>>({});
  readonly businessDiscoveries = signal<Partial<Record<string, BusinessDiscovery>>>({});
  readonly technology = signal('');
  readonly technologyReason = signal('');
  readonly messages = signal<{ question: string; answer: string }[]>([]);

  complete(project: string, report: LocalAnalysisReport): void {
    this.clear();
    this.session.set({ project, report, completedAt: new Date().toISOString() });
  }

  clear(): void {
    this.generation++;
    this.session.set(null);
    this.decisions.set({});
    this.ruleStatuses.set({});
    this.ruleNotes.set({});
    this.ruleInterpretations.set({});
    this.businessDiscoveries.set({});
    this.technology.set('');
    this.technologyReason.set('');
    this.messages.set([]);
  }

  decide(id: string, status: RuleDecision, note: string): void {
    if (!this.session()?.report.findings.some(item => item.id === id && item.category === 'reglas')) return;
    this.decisions.update(value => ({ ...value, [id]: { status, note } }));
  }

  exportData() {
    return {
      schemaVersion: 1, analysis: this.session(), decisions: this.decisions(), ruleStatuses: this.ruleStatuses(), ruleNotes: this.ruleNotes(), ruleInterpretations: this.ruleInterpretations(), businessDiscoveries: this.businessDiscoveries(),
      target: { technology: this.technology(), reason: this.technologyReason() },
      limitations: 'Análisis estático local por patrones, sin IA ni ejecución del código. Los candidatos requieren revisión humana. No demuestra ausencia de riesgos.'
    };
  }
}
