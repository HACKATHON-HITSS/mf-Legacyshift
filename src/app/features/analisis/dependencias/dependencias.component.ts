import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AnalysisModuleComponent } from '../../../shared/analysis-module.component';

@Component({
  selector: 'app-mf-dependencias',
  imports: [AnalysisModuleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<app-mf-analysis-module section="dependencias" />'
})
export class DependenciasComponent {}
