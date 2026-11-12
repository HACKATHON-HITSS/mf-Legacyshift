import { spawn } from 'node:child_process';
import { access, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const JACOCO = 'org.jacoco:jacoco-maven-plugin:0.8.15';

async function reportsUnder(root, depth = 0) {
  if (depth > 12) return [];
  const result = [];
  for (const item of await readdir(root, { withFileTypes: true })) {
    if (item.isSymbolicLink() || ['.git', 'node_modules', '.angular', '.gradle', '.idea'].includes(item.name)) continue;
    const path = join(root, item.name);
    if (item.isDirectory()) result.push(...await reportsUnder(path, depth + 1));
    else if (item.isFile() && (/(?:^|[\\/])surefire-reports[\\/]TEST-[^\\/]+\.xml$/.test(path) || item.name === 'jacoco.xml' || /^legacyshift-[\w-]+\.exec$/.test(item.name))) result.push(path);
    if (result.length > 2000) throw new Error('Hay demasiados informes de pruebas para procesarlos.');
  }
  return result;
}

function attributes(text) {
  return Object.fromEntries([...text.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(match => [match[1], match[2]]));
}

export function summarizeTests(xmls) {
  const totals = { tests: 0, failures: 0, errors: 0, skipped: 0 };
  for (const xml of xmls) {
    // Surefire writes one testsuite per TEST-*.xml; do not count nested testcase elements twice.
    const suite = /<testsuite\b([^>]*)>/.exec(xml);
    if (!suite) continue;
    const values = attributes(suite[1]);
    for (const key of Object.keys(totals)) {
      const value = Number(values[key] ?? 0);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('Un informe de pruebas contiene contadores inválidos.');
      totals[key] += value;
    }
  }
  return { ...totals, passed: Math.max(0, totals.tests - totals.failures - totals.errors - totals.skipped) };
}

export function summarizeCoverage(xml) {
  const stack = [], result = {};
  for (const match of xml.matchAll(/<(\/?)([\w:-]+)\b([^>]*?)(\/?)>/g)) {
    if (match[1]) { stack.pop(); continue; }
    if (match[2] === 'counter' && stack.length === 1 && stack[0] === 'report') {
      const value = attributes(match[3]);
      if (['LINE', 'BRANCH'].includes(value.type)) {
        const missed = Number(value.missed), covered = Number(value.covered);
        if (!Number.isSafeInteger(missed) || !Number.isSafeInteger(covered) || missed < 0 || covered < 0) continue;
        result[value.type.toLowerCase()] = { covered, missed, percent: covered + missed ? Math.round(1000 * covered / (covered + missed)) / 10 : null };
      }
    }
    if (!match[4]) stack.push(match[2]);
  }
  return Object.keys(result).length ? result : null;
}

async function findMaven() {
  const name = process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory || !/^(?:[A-Za-z]:[\\/]|\/)/.test(directory)) continue;
    const path = join(directory, name);
    try { await access(path, constants.R_OK); return path; } catch { /* Next PATH entry. */ }
  }
  throw new Error('Maven no está instalado o no está en PATH.');
}

export async function executeMaven(projectPath, args) {
  const executable = await findMaven();
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/(?:TOKEN|PASSWORD|SECRET|API_KEY)/i.test(key)) delete env[key];
  return new Promise((resolveRun, reject) => {
    // Arguments are fixed by this agent; the project path is only used as cwd, never as shell text.
    const command = process.platform === 'win32' ? 'powershell.exe' : executable;
    env.LEGACYSHIFT_MAVEN = executable;
    const commandArgs = process.platform === 'win32'
      ? ['-NoProfile', '-NonInteractive', '-Command', `& $env:LEGACYSHIFT_MAVEN ${args.map(arg => `'${arg.replace(/'/g, "''")}'`).join(' ')}; exit $LASTEXITCODE`]
      : args;
    const child = spawn(command, commandArgs, { cwd: projectPath, shell: false, windowsHide: true, env, stdio: 'ignore', detached: process.platform !== 'win32' });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32' && child.pid) spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill(); } }
    }, 180_000);
    child.once('error', () => { clearTimeout(timer); reject(new Error('No se pudo iniciar Maven.')); });
    child.once('exit', code => { clearTimeout(timer); resolveRun({ exitCode: code, timedOut }); });
  });
}

export async function runJavaTestAgent(input, run = executeMaven) {
  if (typeof input !== 'string' || !input.trim() || input.length > 1000) throw new Error('Indica la ruta local del proyecto Java.');
  const projectPath = await realpath(resolve(input));
  const pomPath = join(projectPath, 'pom.xml');
  const pom = await readFile(pomPath, 'utf8').catch(() => { throw new Error('Esta carpeta no contiene pom.xml. Para JDeveloper se necesita preparar primero un proyecto de pruebas Java.'); });
  const before = new Map();
  for (const path of await reportsUnder(projectPath)) before.set(path, (await stat(path, { bigint: true })).mtimeNs);
  const runId = randomUUID();
  const dataFile = `target/legacyshift-${runId}.exec`;
  const args = ['-B', '-ntp', `${JACOCO}:prepare-agent`, 'test', `${JACOCO}:report`,
    '-Dmaven.test.failure.ignore=true', '-DskipTests=false', '-Dmaven.test.skip=false',
    `-Djacoco.destFile=${dataFile}`, `-Djacoco.dataFile=${dataFile}`, '-Djacoco.skip=false'];
  const execution = await run(projectPath, args);
  const fresh = [], coverages = [];
  let executionDataFound = false;
  for (const path of await reportsUnder(projectPath)) {
    const info = await stat(path, { bigint: true });
    if (path.endsWith('.exec')) {
      if (path.endsWith(`legacyshift-${runId}.exec`) && info.size > 0n) executionDataFound = true;
      continue;
    }
    if (info.mtimeNs !== before.get(path) && info.size < 10n * 1024n * 1024n) {
      const xml = await readFile(path, 'utf8');
      if (path.endsWith('jacoco.xml')) {
        if (/<group\b/.test(xml)) continue; // Aggregate reports duplicate module counters.
        const coverage = summarizeCoverage(xml);
        if (coverage) coverages.push({ path, coverage });
      } else fresh.push(xml);
    }
  }
  const tests = summarizeTests(fresh);
  const coverage = coverages.length && executionDataFound ? {} : null;
  if (coverage) for (const type of ['line', 'branch']) {
    const counters = coverages.flatMap(item => item.coverage[type] ? [item.coverage[type]] : []);
    if (!counters.length) continue;
    const covered = counters.reduce((sum, item) => sum + item.covered, 0);
    const missed = counters.reduce((sum, item) => sum + item.missed, 0);
    coverage[type] = { covered, missed, percent: covered + missed ? Math.round(1000 * covered / (covered + missed)) / 10 : null };
  }
  const status = execution.timedOut ? 'timeout' : tests.failures || tests.errors ? 'failed' : execution.exitCode !== 0 ? 'build_failed' : !tests.tests || tests.tests === tests.skipped ? 'no_tests' : 'passed';
  return {
    agent: 'java-security-test-runner', projectPath, checkedAt: new Date().toISOString(), status, tests, coverage,
    mockitoDeclared: /<artifactId>mockito-(?:core|inline|junit-jupiter)<\/artifactId>/.test(pom),
    coverageFiles: coverage ? coverages.map(item => item.path) : [],
    conclusion: status === 'passed' ? 'Las pruebas ejecutadas pasaron. Esto no demuestra ausencia de vulnerabilidades.'
      : status === 'no_tests' ? 'No se ejecutaron pruebas. No hay evidencia de comportamiento para evaluar.'
      : status === 'failed' ? 'Hay pruebas que fallaron. Revisar qué comportamiento verificaban antes de clasificarlo como un problema de seguridad.'
      : status === 'timeout' ? 'Las pruebas excedieron el tiempo disponible. El resultado está incompleto.'
      : 'La compilación o ejecución no terminó correctamente. No se puede evaluar el proyecto con este intento.',
    limitations: 'Ejecuta pruebas unitarias Maven existentes. Mockito solo participa si el proyecto lo usa en esas pruebas. JaCoCo mide cobertura, no vulnerabilidades. No crea casos de seguridad automáticamente, no audita dependencias ni realiza pruebas de penetración. La carpeta indicada puede ser distinta de la versión seleccionada en el navegador.'
  };
}
