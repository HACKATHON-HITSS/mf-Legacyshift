import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AnalysisModuleComponent } from '../../../shared/analysis-module.component';

@Component({
  selector: 'app-mf-arquitectura-objetivo',
  imports: [AnalysisModuleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<app-mf-analysis-module section="arquitectura-objetivo" />'
})
export class ArquitecturaComponent {}
