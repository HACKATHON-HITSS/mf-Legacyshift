import { Injectable, signal } from '@angular/core';
import { LocalAnalysisReport } from '../features/codigo-fuente/proyecto/local-project-analyzer';
import { BusinessDiscovery } from './business-discovery';
import { JavaTestResult } from './java-test-result';
import { AiSecurityReview } from './security-review.agent';
import { MigrationPlan, MigrationTarget } from './migration-target';

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
  readonly javaTests = signal<JavaTestResult | null>(null);
  readonly javaTestError = signal('');
  readonly aiSecurityReview = signal<AiSecurityReview | null>(null);
  readonly securityDemoEnabled = signal(false);
  readonly technology = signal('');
  readonly technologyReason = signal('');
  readonly migrationTarget = signal<MigrationTarget>({ projectName: '', javaVersion: '', architecture: '', archetype: '' });
  readonly migrationPlan = signal<MigrationPlan | null>(null);
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
    this.javaTests.set(null);
    this.javaTestError.set('');
    this.aiSecurityReview.set(null);
    this.securityDemoEnabled.set(false);
    this.technology.set('');
    this.technologyReason.set('');
    this.migrationTarget.set({ projectName: '', javaVersion: '', architecture: '', archetype: '' });
    this.migrationPlan.set(null);
    this.messages.set([]);
  }

  decide(id: string, status: RuleDecision, note: string): void {
    if (!this.session()?.report.findings.some(item => item.id === id && item.category === 'reglas')) return;
    this.decisions.update(value => ({ ...value, [id]: { status, note } }));
  }

  exportData() {
    return {
      schemaVersion: 1, analysis: this.session(), decisions: this.decisions(), ruleStatuses: this.ruleStatuses(), ruleNotes: this.ruleNotes(), ruleInterpretations: this.ruleInterpretations(), businessDiscoveries: this.businessDiscoveries(), javaTests: this.javaTests(), aiSecurityReview: this.aiSecurityReview(),
      target: { technology: this.technology(), reason: this.technologyReason(), migration: this.migrationTarget(), plan: this.migrationPlan() },
      limitations: 'El informe distingue detección estática local, revisión con IA y pruebas Java, cuando están disponibles. Las conclusiones de IA son propuestas, no pruebas ejecutadas. Ningún resultado demuestra ausencia de riesgos.'
    };
  }
}
