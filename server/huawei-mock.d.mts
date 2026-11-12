export function generateDiscovery(context: unknown): { resumen: string; reglas: Record<string, unknown>[]; pendientes: string[] };
export function generateAnswer(question: string, context: unknown): string;
export function mockFetch(url: string, options: { body: string }): Promise<Response>;
