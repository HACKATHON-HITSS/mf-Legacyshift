import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runUploadedJavaProject, validateJavaUpload } from './java-project-upload.mjs';

const file = (path, text = '<project/>') => ({ path, data: Buffer.from(text).toString('base64') });

test('rejects traversal, reserved names, duplicates and ambiguous Maven roots', () => {
  for (const path of ['../pom.xml', '/pom.xml', 'C:/pom.xml', 'dir\\pom.xml', 'CON/pom.xml', 'dir./pom.xml']) {
    assert.throws(() => validateJavaUpload([file(path)]), /ruta/);
  }
  assert.throws(() => validateJavaUpload([file('pom.xml'), file('POM.XML')]), /duplicadas/);
  assert.throws(() => validateJavaUpload([file('a/pom.xml'), file('b/pom.xml')]), /varios proyectos/);
  assert.throws(() => validateJavaUpload([file('Demo.java')]), /pom.xml/);
});

test('uses the selected files in a temporary copy and cleans up after successful execution', async () => {
  let staged;
  const result = await runUploadedJavaProject({ projectName: 'Demo.zip', files: [file('Demo.zip/Demo/pom.xml'), file('Demo.zip/Demo/src/Main.java', 'class Main {}'), file('Demo.zip/Demo/.env', 'password=secret'), file('Demo.zip/Demo/target/Old.class', 'old')] }, async path => {
    staged = path;
    assert.equal(await readFile(join(path, 'src', 'Main.java'), 'utf8'), 'class Main {}');
    await assert.rejects(stat(join(path, '.env')));
    await assert.rejects(stat(join(path, 'target', 'Old.class')));
    return { projectPath: path, coverageFiles: [join(path, 'target', 'site', 'jacoco', 'jacoco.xml')], limitations: 'La carpeta indicada puede ser distinta de la versión seleccionada en el navegador.', status: 'passed' };
  });
  assert.equal(result.projectPath, 'Demo.zip');
  assert.deepEqual(result.coverageFiles, ['target/site/jacoco/jacoco.xml']);
  assert.match(result.limitations, /archivos seleccionados/);
  await assert.rejects(stat(staged));
});

test('cleans up the selected copy even if Maven fails to start', async () => {
  let staged;
  await assert.rejects(runUploadedJavaProject({ files: [file('pom.xml')] }, async path => { staged = path; throw new Error('Maven unavailable'); }), /Maven unavailable/);
  await assert.rejects(stat(staged));
});
