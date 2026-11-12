import { JavaAnalysis } from './java-analysis';
import { mapHttpEndpoints } from './http-endpoints';

/** Análisis local y determinista: no usa red, credenciales ni tokens. */
export const HTTP_ENDPOINT_AGENT = {
  id: 'detector-http',
  name: 'Detector de métodos y rutas HTTP',
  analyze(java: JavaAnalysis) {
    return mapHttpEndpoints(java);
  }
} as const;
