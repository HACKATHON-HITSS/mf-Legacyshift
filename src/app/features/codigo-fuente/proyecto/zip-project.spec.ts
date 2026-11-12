import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { extractProjectZip } from './zip-project';
import { analyzeLocalProject } from './local-project-analyzer';

function archive(entries: Record<string, Uint8Array>, compressed = false): File {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [], central: Uint8Array[] = [];
  let localSize = 0;
  for (const [path, data] of Object.entries(entries)) {
    const payload = compressed ? new Uint8Array(deflateRawSync(data)) : data;
    const name = encoder.encode(path);
    const header = new Uint8Array(30 + name.length); const a = new DataView(header.buffer);
    a.setUint32(0, 0x04034b50, true); a.setUint16(4, 20, true); a.setUint16(8, compressed ? 8 : 0, true); a.setUint32(18, payload.length, true); a.setUint32(22, data.length, true); a.setUint16(26, name.length, true); header.set(name, 30);
    const directory = new Uint8Array(46 + name.length); const b = new DataView(directory.buffer);
    b.setUint32(0, 0x02014b50, true); b.setUint16(6, 20, true); b.setUint16(10, compressed ? 8 : 0, true); b.setUint32(20, payload.length, true); b.setUint32(24, data.length, true); b.setUint16(28, name.length, true); b.setUint32(42, localSize, true); directory.set(name, 46);
    local.push(header, payload); central.push(directory); localSize += header.length + payload.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22); const e = new DataView(end.buffer); e.setUint32(0, 0x06054b50, true); e.setUint16(8, central.length, true); e.setUint16(10, central.length, true); e.setUint32(12, centralSize, true); e.setUint32(16, localSize, true);
  const bytes = new Uint8Array(localSize + centralSize + 22); let cursor = 0;
  for (const item of [...local, ...central, end]) { bytes.set(item, cursor); cursor += item.length; }
  const file = new File([bytes.buffer as ArrayBuffer], 'demo.zip');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer });
  return file;
}

describe('Carga ZIP local', () => {
  it('extrae en memoria, conserva rutas y permite analizar Java', async () => {
    const files = await extractProjectZip(archive({ 'src/Demo.java': new TextEncoder().encode('class Demo { public void run() {} }') }));
    expect(files).toHaveLength(1);
    expect(files[0].webkitRelativePath).toBe('demo.zip/src/Demo.java');
    // jsdom File lacks arrayBuffer; browser File implements it natively.
    Object.defineProperty(files[0], 'arrayBuffer', { value: async () => new TextEncoder().encode('class Demo { public void run() {} }').buffer });
    const report = await analyzeLocalProject(files, () => undefined);
    expect(report.java.components[0].name).toBe('Demo');
    expect(report.java.components[0].path).toBe('demo.zip/src/Demo.java');
  });
  it('rechaza rutas peligrosas y duplicadas sin extraer archivos', async () => {
    await expect(extractProjectZip(archive({ '../escape.java': new TextEncoder().encode('x') }))).rejects.toThrow(/ruta insegura/);
    await expect(extractProjectZip(archive({ 'A.java': new TextEncoder().encode('x'), 'a.java': new TextEncoder().encode('y') }))).rejects.toThrow(/duplicadas/);
  });
  it('admite entradas DEFLATE además de archivos sin compresión', async () => {
    const files = await extractProjectZip(archive({ 'src/A.java': new TextEncoder().encode('class A { void run() {} }') }, true));
    expect(files[0].webkitRelativePath).toBe('demo.zip/src/A.java');
  });
  it('rechaza entradas mayores de 5 MB y ZIP truncados', async () => {
    await expect(extractProjectZip(archive({ 'large.java': new Uint8Array(5 * 1024 * 1024 + 1) }))).rejects.toThrow(/límite|tamaño/i);
    const file = new File([new Uint8Array(22)], 'bad.zip');
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array(22).buffer });
    await expect(extractProjectZip(file)).rejects.toThrow(/inválido|incompleto/i);
  });
});
