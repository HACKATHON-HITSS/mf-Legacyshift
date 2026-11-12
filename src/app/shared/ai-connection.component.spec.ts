import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiConnectionComponent } from './ai-connection.component';
import { HuaweiAnalysisService } from './huawei-analysis.service';

describe('Conexión compartida con Huawei', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  afterEach(() => { vi.unstubAllGlobals(); TestBed.resetTestingModule(); });

  it('verifica la conexión y no conserva la llave en el formulario ni en el estado', async () => {
    const service = TestBed.inject(HuaweiAnalysisService);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ configured: true, verified: true, model: 'glm-5.2', url: service.defaultUrl }) }));
    const fixture = TestBed.createComponent(AiConnectionComponent);
    const input = document.createElement('input'); input.value = 'secret-test-key';
    await fixture.componentInstance.connect(service.defaultUrl, 'glm-5.2', input);
    expect(input.value).toBe('');
    expect(service.connection()).toMatchObject({ configured: true, verified: true, model: 'glm-5.2' });
    expect(JSON.stringify(service.connection())).not.toContain('secret-test-key');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('IA conectada');
  });

  it('muestra errores del servicio y limpia la llave aunque falle la verificación', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Huawei rechazó la llave.' }) }));
    const fixture = TestBed.createComponent(AiConnectionComponent);
    const input = document.createElement('input'); input.value = 'incorrect';
    await fixture.componentInstance.connect('https://api-ap-southeast-1.modelarts-maas.com/openai/v1', 'glm-5.2', input);
    expect(input.value).toBe('');
    expect(fixture.componentInstance.error()).toContain('rechazó la llave');
    expect(TestBed.inject(HuaweiAnalysisService).connection()).toBeNull();
  });

  it('conserva el estado común entre componentes y permite desconectar', async () => {
    const service = TestBed.inject(HuaweiAnalysisService);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ configured: true, verified: true, model: 'glm-5.2', url: service.defaultUrl }) }));
    await service.connect(service.defaultUrl, 'glm-5.2', 'secret');
    const first = TestBed.createComponent(AiConnectionComponent);
    const second = TestBed.createComponent(AiConnectionComponent);
    expect(first.componentInstance.huawei).toBe(second.componentInstance.huawei);
    expect(second.componentInstance.huawei.connection()?.verified).toBe(true);
    await second.componentInstance.disconnect();
    expect(first.componentInstance.huawei.connection()?.configured).toBe(false);
  });
});
