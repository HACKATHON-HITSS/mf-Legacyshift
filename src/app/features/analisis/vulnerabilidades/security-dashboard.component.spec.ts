import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisSessionService } from '../../../shared/analysis-session.service';
import { analyzeLocalProject } from '../../codigo-fuente/proyecto/local-project-analyzer';
import { SecurityDashboardComponent } from './security-dashboard.component';

describe('Panel fijo de vulnerabilidades', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] }));
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  it('muestra los cinco indicadores de la referencia sin IA ni bloques anteriores', async () => {
    TestBed.inject(AnalysisSessionService).complete('Proyecto', await analyzeLocalProject([], () => undefined));
    const network = vi.fn(); vi.stubGlobal('fetch', network);
    const fixture = TestBed.createComponent(SecurityDashboardComponent); fixture.detectChanges();
    const values = Array.from(fixture.nativeElement.querySelectorAll('dd')).map(node => (node as HTMLElement).textContent?.trim());
    expect(values).toEqual(['36', '3', '89%', '86.1%', '9']);
    expect(fixture.nativeElement.textContent).toContain('Datos de demostración');
    expect(fixture.nativeElement.textContent).not.toContain('Huawei');
    expect(fixture.nativeElement.textContent).not.toContain('Pruebas Java');
    expect(network).not.toHaveBeenCalled();
  });

  it('solicita analizar un proyecto antes de mostrar los indicadores', () => {
    const fixture = TestBed.createComponent(SecurityDashboardComponent); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dd')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Primero selecciona y analiza');
  });
});
