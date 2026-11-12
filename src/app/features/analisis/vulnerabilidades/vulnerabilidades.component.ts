import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AnalysisModuleComponent } from '../../../shared/analysis-module.component';

@Component({
  selector: 'app-mf-vulnerabilidades',
  imports: [AnalysisModuleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<app-mf-analysis-module section="vulnerabilidades" />'
})
export class VulnerabilidadesComponent {}
