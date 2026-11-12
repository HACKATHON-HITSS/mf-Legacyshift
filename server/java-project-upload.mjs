import { mkdtemp, mkdir, writeFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { runJavaTestAgent } from './java-test-agent.mjs';

const MAX_TOTAL = 50 * 1024 * 1024;
const excluded = new Set(['.git', 'node_modules', 'target', 'build', '.angular', '.gradle', '.idea']);

export function validateJavaUpload(files) {
  if (!Array.isArray(files) || !files.length || files.length > 2000) throw new Error('Selecciona un proyecto de hasta 2.000 archivos.');
  const names = new Set(), accepted = [];
  let total = 0;
  for (const file of files) {
    const path = file?.path;
    if (typeof path !== 'string' || path.length > 500 || /[\\:\x00-\x1f]/.test(path) || path.startsWith('/')) throw new Error('El proyecto contiene una ruta no válida.');
    const parts = path.split('/');
    if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(?:CON|PRN|AUX|NUL|COM\d|LPT\d)(?:\.|$)/i.test(part))) throw new Error('El proyecto contiene una ruta no válida.');
    if (parts.some(part => excluded.has(part.toLowerCase())) || /^\.env(?:\.|$)/i.test(parts.at(-1))) continue;
    if (names.has(path.toLowerCase())) throw new Error('El proyecto contiene rutas duplicadas.');
    names.add(path.toLowerCase());
    if (typeof file.data !== 'string' || file.data.length > 14 * 1024 * 1024 || file.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) throw new Error('Un archivo no tiene un contenido válido.');
    const bytes = Buffer.from(file.data, 'base64'); total += bytes.length;
    if (bytes.length > 10 * 1024 * 1024 || total > MAX_TOTAL) throw new Error('El proyecto supera los límites: 10 MB por archivo y 50 MB en total.');
    accepted.push({ path, bytes });
  }
  const poms = accepted.filter(file => file.path.split('/').at(-1) === 'pom.xml').sort((a, b) => a.path.split('/').length - b.path.split('/').length);
  if (!poms.length) throw new Error('El proyecto seleccionado no contiene pom.xml. Para ejecutar JaCoCo necesita una configuración de pruebas Maven.');
  const depth = poms[0].path.split('/').length;
  if (poms.filter(file => file.path.split('/').length === depth).length > 1) throw new Error('Hay varios proyectos Maven al mismo nivel. Selecciona la carpeta de un solo proyecto.');
  return { files: accepted, pom: poms[0].path };
}

export async function runUploadedJavaProject(payload, runner = runJavaTestAgent) {
  const upload = validateJavaUpload(payload?.files);
  const root = await mkdtemp(join(tmpdir(), 'legacyshift-java-upload-'));
  try {
    for (const file of upload.files) {
      const path = resolve(root, ...file.path.split('/'));
      if (!path.startsWith(root + sep)) throw new Error('Ruta fuera de la copia del proyecto.');
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.bytes, { flag: 'wx' });
    }
    const projectPath = dirname(join(root, ...upload.pom.split('/')));
    const result = await runner(projectPath);
    return { ...result, projectPath: typeof payload.projectName === 'string' ? payload.projectName.slice(0, 200) : 'Proyecto seleccionado',
      coverageFiles: result.coverageFiles.map(path => relative(projectPath, path).replace(/\\/g, '/')),
      limitations: result.limitations.replace('La carpeta indicada puede ser distinta de la versión seleccionada en el navegador.', 'Se probaron copias temporales de los archivos seleccionados al inicio.') };
  } finally {
    const target = await realpath(root);
    if (dirname(target) !== await realpath(tmpdir()) || !basename(target).startsWith('legacyshift-java-upload-')) throw new Error('No se pudo verificar la carpeta temporal para su limpieza.');
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
  }
}
