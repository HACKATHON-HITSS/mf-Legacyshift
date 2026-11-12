import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LocalAnalysisReport } from './local-project-analyzer';

@Component({
  selector: 'app-mf-project-analysis-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-analysis-results.component.html',
  styleUrl: './project-analysis-results.component.css'
})
export class ProjectAnalysisResultsComponent {
  readonly report = input.required<LocalAnalysisReport>();

  downloadReport(): void {
    const blob = new Blob([JSON.stringify(this.report(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'legacyshift-analisis-local.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
