import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalysisSessionService } from '../../../shared/analysis-session.service';

export const SECURITY_DASHBOARD_INDICATORS = [
  { label: 'PR evaluados', value: '36', detail: '18 con todos los controles conformes', tone: 'neutral' },
  { label: 'Hallazgos críticos abiertos', value: '3', detail: '23 observaciones de calidad', tone: 'danger' },
  { label: 'Cumplimiento de controles', value: '89%', detail: 'Incluye los ocho controles requeridos', tone: 'success' },
  { label: 'Cobertura vigente promedio', value: '86.1%', detail: 'Mínimo requerido 80%', tone: 'success' },
  { label: 'PR con bloqueos', value: '9', detail: '3 con evidencia pendiente', tone: 'danger' }
] as const;

@Component({
  selector: 'app-mf-security-dashboard',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './security-dashboard.component.html',
  styleUrl: './security-dashboard.component.css'
})
export class SecurityDashboardComponent {
  readonly store = inject(AnalysisSessionService);
  readonly indicators = SECURITY_DASHBOARD_INDICATORS;

  exportIndicators(): void {
    const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [['Origen', 'Indicador', 'Valor', 'Detalle'], ...this.indicators.map(item => ['DATOS SIMULADOS', item.label, item.value, item.detail])];
    const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'indicadores-seguridad-DEMO.csv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
