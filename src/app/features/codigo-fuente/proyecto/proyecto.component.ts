import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { AnalysisSessionService } from '../../../shared/analysis-session.service';
import { analyzeLocalProject, LocalAnalysisReport } from './local-project-analyzer';
import { extractProjectZip } from './zip-project';

type ProjectAttachment = {
  readonly kind: 'file' | 'folder';
  readonly name: string;
  readonly size: number;
  readonly files: readonly File[];
};

@Component({
  selector: 'app-mf-proyecto',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './proyecto.component.html',
  styleUrl: './proyecto.component.css'
})
export class ProyectoComponent {
  readonly sessionStore = inject(AnalysisSessionService);
  readonly selectedAttachment = signal<ProjectAttachment | null>(null);
  readonly errorMessage = signal('');
  readonly isDragging = signal(false);
  readonly isAnalyzing = signal(false);
  readonly processedFiles = signal(0);
  readonly totalFiles = signal(0);
  readonly analysisReport = signal<LocalAnalysisReport | null>(this.sessionStore.session()?.report ?? null);
  private dragDepth = 0;
  private readonly filePicker = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly folderPicker = viewChild<ElementRef<HTMLInputElement>>('folderInput');

  onFileSelected(input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    if (this.rejectChangeWhileAnalyzing()) return;
    if (files.length > 0) {
      this.selectFiles(files);
      if (this.selectedAttachment()?.files[0] === files[0]) this.clearPicker('folder');
    }
  }

  onFolderSelected(input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    if (this.rejectChangeWhileAnalyzing()) return;
    if (files.length === 0) {
      return;
    }
    const name = files[0].webkitRelativePath.split('/')[0];
    if (!name || files.some(file => !file.webkitRelativePath.startsWith(`${name}/`))) {
      this.errorMessage.set('El navegador no informó las rutas de la carpeta. Selecciona la carpeta desde un navegador compatible, como Chrome o Edge.');
      return;
    }
    this.setAttachment({
      kind: 'folder',
      name,
      size: files.reduce((total, file) => total + file.size, 0),
      files
    });
    this.clearPicker('file');
    this.errorMessage.set('');
  }

  onDragEnter(event: DragEvent): void {
    event.preventDefault();
    this.dragDepth++;
    this.isDragging.set(true);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    this.isDragging.set(this.dragDepth > 0);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.resetDragState();
    if (this.rejectChangeWhileAnalyzing()) return;
    if (Array.from(event.dataTransfer?.items ?? []).some(item => item.webkitGetAsEntry?.()?.isDirectory)) {
      this.errorMessage.set('Para adjuntar una carpeta completa, usa el botón Seleccionar carpeta.');
      return;
    }
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) {
      this.errorMessage.set('No se recibió un archivo. Usa el botón Seleccionar archivo.');
      return;
    }
    this.selectFiles(files);
  }

  removeAttachment(): void {
    if (this.rejectChangeWhileAnalyzing()) return;
    this.selectedAttachment.set(null);
    this.clearPicker('file');
    this.clearPicker('folder');
    this.analysisReport.set(null);
    this.sessionStore.clear();
    this.errorMessage.set('');
    this.resetDragState();
  }

  async analyzeProject(): Promise<void> {
    if (this.rejectChangeWhileAnalyzing()) return;
    const attachment = this.selectedAttachment();
    if (!attachment) {
      this.errorMessage.set('Selecciona un archivo o carpeta antes de analizar.');
      return;
    }
    this.isAnalyzing.set(true);
    this.processedFiles.set(0);
    this.totalFiles.set(attachment.files.length);
    this.errorMessage.set('');
    this.analysisReport.set(null);
    this.resetDragState();
    this.sessionStore.clear();
    const revision = this.sessionStore.revision;
    try {
      const files = attachment.kind === 'file' && /\.zip$/i.test(attachment.name)
        ? await extractProjectZip(attachment.files[0]) : attachment.files;
      if (revision !== this.sessionStore.revision) return;
      this.totalFiles.set(files.length);
      const report = await analyzeLocalProject(
        files,
        processed => this.processedFiles.set(processed)
      );
      if (revision !== this.sessionStore.revision) return;
      this.analysisReport.set(report);
      this.sessionStore.complete(attachment.name, report);
    } catch (error) {
      console.error('Error al analizar el proyecto localmente', error);
      this.errorMessage.set(`El análisis no pudo completarse: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.isAnalyzing.set(false);
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const size = new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(bytes / 1024 ** unitIndex);
    return `${size} ${units[unitIndex]}`;
  }

  private selectFiles(files: readonly File[]): void {
    if (files.length !== 1) {
      this.errorMessage.set('Adjunta un solo archivo a la vez.');
      return;
    }
    const file = files[0];
    if (file.size === 0) {
      this.errorMessage.set('El archivo está vacío. Selecciona un archivo con contenido.');
      return;
    }
    this.setAttachment({ kind: 'file', name: file.name, size: file.size, files: [file] });
    this.errorMessage.set('');
  }

  private setAttachment(attachment: ProjectAttachment): void {
    this.selectedAttachment.set(attachment);
    this.analysisReport.set(null);
    this.sessionStore.clear();
    this.processedFiles.set(0);
  }

  private rejectChangeWhileAnalyzing(): boolean {
    if (!this.isAnalyzing()) return false;
    this.errorMessage.set('Espera a que termine el análisis antes de cambiar la selección.');
    return true;
  }

  private resetDragState(): void {
    this.dragDepth = 0;
    this.isDragging.set(false);
  }

  private clearPicker(kind: 'file' | 'folder'): void {
    const picker = kind === 'file' ? this.filePicker() : this.folderPicker();
    if (picker) picker.nativeElement.value = '';
  }
}
