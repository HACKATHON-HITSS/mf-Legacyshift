// Browser regression check. Requires Playwright and Edge on Windows (Chromium on other platforms).
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, realpath, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const { chromium } = await import(process.env.LEGACYSHIFT_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
let directory;
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.argv[2] || 'http://localhost:4201/codigo-fuente/proyecto');
  await page.getByRole('heading', { name: 'Seleccionar proyecto', exact: true }).waitFor();
  const file = page.locator('.file-picker input[type=file]:not([webkitdirectory])');
  const folder = page.locator('.file-picker input[webkitdirectory]');
  await page.waitForFunction(() => {
    const input = document.querySelector('.file-picker input[type=file]');
    return input && getComputedStyle(input).opacity === '1' && getComputedStyle(input).position !== 'absolute';
  });
  const chooserFor = async input => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), input.click({ position: { x: 20, y: 20 } })]);
    return chooser;
  };
  const example = { name: 'Demo.java', mimeType: 'text/plain', buffer: Buffer.from('class Demo {}') };
  await (await chooserFor(file)).setFiles(example);
  assert.equal(await page.locator('.selected-file .file-name').innerText(), 'Demo.java');
  assert.ok(await page.getByRole('button', { name: 'Analizar archivo', exact: true }).isEnabled());
  await page.locator('.selected-file button').click();
  assert.equal(await file.inputValue(), '');
  await (await chooserFor(file)).setFiles(example);
  assert.equal(await page.locator('.selected-file .file-name').innerText(), 'Demo.java');
  directory = await mkdtemp(join(tmpdir(), 'legacyshift-picker-check-'));
  await mkdir(join(directory, 'src'));
  await writeFile(join(directory, 'src', 'Demo.java'), 'class Demo {}');
  await writeFile(join(directory, 'pom.xml'), '<project/>');
  await (await chooserFor(folder)).setFiles(directory);
  const paths = await folder.evaluate(input => Array.from(input.files).map(item => item.webkitRelativePath));
  assert.equal(paths.length, 2);
  assert.ok(paths.some(path => path.endsWith('/src/Demo.java')));
  assert.equal(await file.inputValue(), '');
  assert.ok(await page.getByRole('button', { name: 'Analizar carpeta', exact: true }).isEnabled());
  assert.deepEqual(errors, []);
  console.log('OK: diálogos nativos de archivo y carpeta, selección, reselección, subcarpetas y habilitación del análisis.');
} finally {
  await browser.close();
  if (directory) {
    const target = await realpath(directory);
    assert.equal(dirname(target), await realpath(tmpdir()));
    assert.ok(basename(target).startsWith('legacyshift-picker-check-'));
    await rm(target, { recursive: true, force: true });
  }
}
