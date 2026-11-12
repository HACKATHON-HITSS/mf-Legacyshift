import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AnalysisModuleComponent } from '../../../shared/analysis-module.component';

@Component({
  selector: 'app-mf-entradas-salidas',
  imports: [AnalysisModuleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<app-mf-analysis-module section="entradas-salidas" />'
})
export class EntradasSalidasComponent {}
