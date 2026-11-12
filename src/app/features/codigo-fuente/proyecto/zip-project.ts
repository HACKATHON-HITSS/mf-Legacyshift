import { Unzip, UnzipInflate, strFromU8 } from 'fflate';

const MAX_ARCHIVE = 25 * 1024 * 1024;
const MAX_FILE = 5 * 1024 * 1024;
const MAX_TOTAL = 50 * 1024 * 1024;
const MAX_FILES = 1000;

function safePath(path: string): boolean {
  return !!path && !path.startsWith('/') && !path.includes('\\') && !/[\x00-\x1f:]/.test(path)
    && path.split('/').every((part, index, parts) => (index === parts.length - 1 && part === '') || (!!part && part !== '.' && part !== '..'));
}

/** Extracts ZIP entries into memory only. Rejects unsafe paths and bounded-size violations. */
export async function extractProjectZip(archive: File): Promise<File[]> {
  if (archive.size > MAX_ARCHIVE) throw new Error('El ZIP supera el límite de 25 MB.');
  const bytes = new Uint8Array(await archive.arrayBuffer());
  if (bytes.length < 22) throw new Error('El ZIP está vacío o incompleto.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { eocd = i; break; }
  }
  if (eocd < 0 || view.getUint16(eocd + 4, true) || view.getUint16(eocd + 6, true)) throw new Error('ZIP inválido o multidisco no compatible.');
  const count = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryStart = view.getUint32(eocd + 16, true);
  if (count === 0xffff || directoryStart === 0xffffffff || directorySize === 0xffffffff || count > MAX_FILES || directoryStart + directorySize !== eocd || view.getUint16(eocd + 8, true) !== count) throw new Error('ZIP64, directorio inválido o más de 1.000 entradas.');
  const expected = new Map<string, number>();
  let offset = directoryStart;
  let declaredTotal = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > eocd || view.getUint32(offset, true) !== 0x02014b50) throw new Error('Directorio ZIP incompleto.');
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true), size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > eocd || flags & 1 || ![0, 8].includes(method) || size === 0xffffffff || compressed === 0xffffffff) throw new Error('ZIP cifrado, ZIP64 o compresión no compatible.');
    const path = strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (!safePath(path)) throw new Error('El ZIP contiene una ruta insegura.');
    const mode = view.getUint32(offset + 38, true) >>> 16;
    if ((mode & 0xf000) === 0xa000) throw new Error('El ZIP contiene un enlace simbólico.');
    if (!path.endsWith('/')) {
      const key = path.toLocaleLowerCase();
      if (expected.has(key)) throw new Error('El ZIP contiene rutas duplicadas.');
      if (size > MAX_FILE || (compressed === 0 && size > 0) || (compressed > 0 && size > compressed * 200 && size > 1024 * 1024)) throw new Error('Un archivo del ZIP excede los límites de tamaño o compresión.');
      declaredTotal += size;
      if (declaredTotal > MAX_TOTAL) throw new Error('El ZIP descomprimido supera 50 MB.');
      expected.set(key, size);
    }
    offset = end;
  }
  if (offset !== eocd) throw new Error('Directorio ZIP inválido.');
  const result: File[] = [];
  const seen = new Set<string>();
  let actualTotal = 0;
  const unzip = new Unzip(entry => {
    if (!safePath(entry.name)) throw new Error('El ZIP contiene una ruta insegura.');
    if (entry.name.endsWith('/')) return;
    const key = entry.name.toLocaleLowerCase();
    if (!expected.has(key) || seen.has(key)) throw new Error('Las entradas locales del ZIP no coinciden con el directorio.');
    seen.add(key);
    const chunks: Uint8Array[] = [];
    let length = 0;
    entry.ondata = (error, data, final) => {
      if (error) throw error;
      length += data.length; actualTotal += data.length;
      if (length > MAX_FILE || actualTotal > MAX_TOTAL || length > expected.get(key)!) throw new Error('El contenido ZIP supera el tamaño permitido.');
      chunks.push(new Uint8Array(data));
      if (final) {
        if (length !== expected.get(key)) throw new Error('El tamaño de un archivo ZIP no coincide con el declarado.');
        const file = new File(chunks.map(chunk => chunk.buffer as ArrayBuffer), entry.name.split('/').pop()!);
        Object.defineProperty(file, 'webkitRelativePath', { value: `${archive.name}/${entry.name}` });
        result.push(file);
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  // Small compressed chunks bound the amount a malformed stream can expand before
  // the ondata limits above can stop extraction.
  for (let index = 0; index < bytes.length; index += 8192) {
    unzip.push(bytes.subarray(index, Math.min(index + 8192, bytes.length)), index + 8192 >= bytes.length);
  }
  if (result.length !== expected.size || !result.length) throw new Error('El ZIP no contiene archivos compatibles o está incompleto.');
  return result;
}
