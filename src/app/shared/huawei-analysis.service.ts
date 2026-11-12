import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class HuaweiAnalysisService {
  private connectionRevision = 0;
  readonly connection = signal<{ configured: boolean; verified: boolean; model: string; url: string } | null>(null);
  readonly defaultUrl = 'https://api-ap-southeast-1.modelarts-maas.com/openai/v1';

  async refreshConnection(): Promise<void> {
    const revision = this.connectionRevision;
    try {
      const response = await fetch(`${environment.huaweiApiBaseUrl}/api/legacyshift/huawei/connection`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Servicio no disponible');
      const value = await response.json();
      if (typeof value?.configured !== 'boolean' || typeof value?.verified !== 'boolean' || typeof value?.model !== 'string' || typeof value?.url !== 'string') throw new Error('Estado inválido');
      if (revision === this.connectionRevision) this.connection.set(value);
    } catch { if (revision === this.connectionRevision) this.connection.set(null); }
  }

  async connect(url: string, model: string, apiKey: string): Promise<void> {
    const revision = ++this.connectionRevision;
    let response: Response;
    try {
      response = await fetch(`${environment.huaweiApiBaseUrl}/api/legacyshift/huawei/connection`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, model, apiKey }), signal: AbortSignal.timeout(120_000)
      });
    } catch { throw new Error('No se pudo contactar al servicio local de IA. Comprueba que esté iniciado.'); }
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'No se pudo conectar con Huawei.');
    if (!result || result.configured !== true || result.verified !== true || typeof result.model !== 'string' || typeof result.url !== 'string') throw new Error('El servicio devolvió un estado de conexión inválido.');
    if (revision === this.connectionRevision) this.connection.set(result);
  }

  async disconnect(): Promise<void> {
    const revision = ++this.connectionRevision;
    let response: Response;
    try { response = await fetch(`${environment.huaweiApiBaseUrl}/api/legacyshift/huawei/connection`, { method: 'DELETE', signal: AbortSignal.timeout(5000) }); }
    catch { throw new Error('No se pudo contactar al servicio local de IA.'); }
    if (!response.ok) throw new Error('No se pudo desconectar.');
    if (revision === this.connectionRevision) this.connection.set({ configured: false, verified: false, model: '', url: this.defaultUrl });
  }

  async ask(question: string, context: unknown): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${environment.huaweiApiBaseUrl}/api/legacyshift/huawei`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context }), signal: AbortSignal.timeout(120_000)
      });
    } catch {
      throw new Error('No se pudo contactar al servicio de Huawei. Verifica que el servidor de análisis esté iniciado.');
    }
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'La consulta a Huawei no pudo completarse.';
      throw new Error(message);
    }
    if (!result || typeof result !== 'object' || !('answer' in result) || typeof result.answer !== 'string') throw new Error('El servicio devolvió una respuesta inválida.');
    return result.answer;
  }
}
