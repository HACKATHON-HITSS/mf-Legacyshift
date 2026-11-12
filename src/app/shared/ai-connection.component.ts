import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { HuaweiAnalysisService } from './huawei-analysis.service';

@Component({
  selector: 'app-mf-ai-connection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-connection.component.html',
  styleUrl: './ai-connection.component.css'
})
export class AiConnectionComponent implements OnInit {
  readonly huawei = inject(HuaweiAnalysisService);
  readonly open = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');

  ngOnInit(): void { void this.huawei.refreshConnection(); }

  async connect(url: string, model: string, key: HTMLInputElement): Promise<void> {
    if (this.busy()) return;
    this.error.set(''); this.message.set('');
    if (!url.trim() || !model.trim() || !key.value.trim()) { this.error.set('Completa la URL, el modelo y la llave.'); return; }
    this.busy.set(true);
    try {
      await this.huawei.connect(url.trim(), model.trim(), key.value);
      this.message.set('Conexión verificada. Ya puedes consultar Huawei desde los módulos.');
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo conectar.'); }
    finally { key.value = ''; this.busy.set(false); }
  }

  async disconnect(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await this.huawei.disconnect(); this.message.set('Conexión desconectada.'); }
    catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo desconectar.'); }
    finally { this.busy.set(false); }
  }
}
