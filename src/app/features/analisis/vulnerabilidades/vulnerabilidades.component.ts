import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SecurityDashboardComponent } from './security-dashboard.component';

@Component({
  selector: 'app-mf-vulnerabilidades',
  imports: [SecurityDashboardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<app-mf-security-dashboard />'
})
export class VulnerabilidadesComponent {}
