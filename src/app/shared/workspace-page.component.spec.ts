import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppComponent } from '../app.component';
import { routes } from '../app.routes';

describe('Legacyshift scaffold', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter(routes)]
    });
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('External services are disabled');
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('renders all nine empty modules without business controls or external requests', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    fixture.detectChanges();

    for (const [path, title] of Object.entries({
      dashboard: 'Dashboard',
      'pull-requests': 'Pull Requests',
      hallazgos: 'Hallazgos',
      cobertura: 'Cobertura',
      asistente: 'Asistente',
      historial: 'Historial',
      proyectos: 'Proyectos',
      reportes: 'Reportes',
      configuracion: 'Configuracion'
    })) {
      await router.navigateByUrl(`/${path}`);
      fixture.detectChanges();
      const page: HTMLElement = fixture.nativeElement;
      expect(router.url).toBe(`/${path}`);
      expect(page.querySelector('h1')?.textContent).toBe(title);
      expect(page.textContent).toContain('Legacyshift');
      expect(page.textContent).toContain('Sin contenido.');
      expect(page.querySelector('input, select, button, table, canvas, form')).toBeNull();
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves shell aliases and resolves default and unknown routes', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    fixture.detectChanges();

    for (const [path, destination] of Object.entries({
      '/': '/codigo-fuente/proyecto',
      '/default': '/codigo-fuente/proyecto',
      '/template': '/pull-requests',
      '/bitbucket': '/configuracion',
      '/unknown': '/dashboard'
    })) {
      await router.navigateByUrl(path);
      fixture.detectChanges();
      expect(router.url).toBe(destination);
      expect(fixture.nativeElement.querySelector('h1')).not.toBeNull();
    }
  });
});
