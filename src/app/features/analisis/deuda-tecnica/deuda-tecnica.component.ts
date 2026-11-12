import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AnalysisModuleComponent } from '../../../shared/analysis-module.component';

@Component({
  selector: 'app-mf-deuda-tecnica',
  imports: [AnalysisModuleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<app-mf-analysis-module section="deuda-tecnica" />'
})
export class DeudaTecnicaComponent {}
