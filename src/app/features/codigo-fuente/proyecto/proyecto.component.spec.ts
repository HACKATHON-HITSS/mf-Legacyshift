import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProyectoComponent } from './proyecto.component';

describe('Selección nativa de archivos y carpetas', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  afterEach(() => TestBed.resetTestingModule());

  it('recibe el archivo desde el input nativo y habilita el análisis', () => {
    const fixture = TestBed.createComponent(ProyectoComponent); fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('.file-picker input:not([webkitdirectory])') as HTMLInputElement;
    expect(input.hidden).toBe(false);
    expect(input.disabled).toBe(false);
    const file = new File(['class Demo {}'], 'Demo.java');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true })); fixture.detectChanges();
    expect(fixture.componentInstance.selectedAttachment()).toMatchObject({ kind: 'file', name: 'Demo.java', files: [file] });
    expect((fixture.nativeElement.querySelector('.card-footer button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('conserva las rutas de la carpeta seleccionada y permite reemplazarla por un archivo', () => {
    const fixture = TestBed.createComponent(ProyectoComponent); fixture.detectChanges();
    const folder = fixture.nativeElement.querySelector('input[webkitdirectory]') as HTMLInputElement;
    expect(folder.multiple).toBe(true);
    expect(folder.hidden).toBe(false);
    const file = new File(['class Demo {}'], 'Demo.java');
    Object.defineProperty(file, 'webkitRelativePath', { value: 'Proyecto/src/Demo.java' });
    Object.defineProperty(folder, 'files', { value: [file] });
    folder.dispatchEvent(new Event('change', { bubbles: true })); fixture.detectChanges();
    expect(fixture.componentInstance.selectedAttachment()).toMatchObject({ kind: 'folder', name: 'Proyecto', files: [file] });
    const input = fixture.nativeElement.querySelector('.file-picker input:not([webkitdirectory])') as HTMLInputElement;
    const other = new File(['example'], 'Otro.txt');
    Object.defineProperty(input, 'files', { value: [other] });
    input.dispatchEvent(new Event('change', { bubbles: true })); fixture.detectChanges();
    expect(fixture.componentInstance.selectedAttachment()?.name).toBe('Otro.txt');
  });

  it('bloquea los inputs únicamente durante el análisis y los reactiva después', () => {
    const fixture = TestBed.createComponent(ProyectoComponent); fixture.detectChanges();
    const inputs = Array.from(fixture.nativeElement.querySelectorAll('.file-picker input')) as HTMLInputElement[];
    fixture.componentInstance.isAnalyzing.set(true); fixture.detectChanges();
    expect(inputs.every(input => input.disabled)).toBe(true);
    fixture.componentInstance.isAnalyzing.set(false); fixture.detectChanges();
    expect(inputs.every(input => !input.disabled)).toBe(true);
  });
});
