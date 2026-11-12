import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { runJavaTestAgent, summarizeCoverage, summarizeTests } from './java-test-agent.mjs';

async function cleanup(root) {
  const target = await realpath(root);
  assert.equal(dirname(target), await realpath(tmpdir()));
  assert.ok(basename(target).startsWith('legacyshift-java-'));
  await rm(target, { recursive: true, force: true });
}

const coverageXml = '<report><package name="x"><counter type="LINE" covered="1" missed="9"/></package><counter type="LINE" covered="8" missed="2"/><counter type="BRANCH" covered="3" missed="1"/></report>';

test('parses test and coverage totals without adding nested counters', () => {
  assert.deepEqual(summarizeTests(['<testsuite tests="5" failures="1" errors="1" skipped="1"></testsuite>']), { tests: 5, failures: 1, errors: 1, skipped: 1, passed: 2 });
  assert.equal(summarizeCoverage(coverageXml).line.percent, 80);
  assert.equal(summarizeCoverage(coverageXml).branch.percent, 75);
  assert.equal(summarizeCoverage('<report/>'), null);
});

test('rejects missing builds before running and never presents old reports as new tests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legacyshift-java-'));
  try {
    let called = false;
    await assert.rejects(runJavaTestAgent(root, async () => { called = true; }), /pom.xml/);
    assert.equal(called, false);
    await writeFile(join(root, 'pom.xml'), '<project/>');
    await mkdir(join(root, 'target', 'surefire-reports'), { recursive: true });
    await writeFile(join(root, 'target', 'surefire-reports', 'TEST-Old.xml'), '<testsuite tests="50" failures="0" errors="0" skipped="0"/>');
    const report = await runJavaTestAgent(root, async () => ({ exitCode: 0, timedOut: false }));
    assert.equal(report.status, 'no_tests');
    assert.equal(report.tests.tests, 0);
    assert.equal(report.coverage, null);
  } finally { await cleanup(root); }
});

test('records only new tests, reports failures independently from Maven exit code and leaves pom unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legacyshift-java-'));
  try {
    const pom = '<project><artifactId>mockito-core</artifactId></project>';
    await writeFile(join(root, 'pom.xml'), pom);
    const report = await runJavaTestAgent(root, async (cwd, args) => {
      assert.equal(cwd, await realpath(root));
      assert.ok(args.includes('org.jacoco:jacoco-maven-plugin:0.8.15:prepare-agent'));
      assert.ok(args.includes('-DskipTests=false'));
      await mkdir(join(root, 'target', 'surefire-reports'), { recursive: true });
      await mkdir(join(root, 'target', 'site', 'jacoco'), { recursive: true });
      await writeFile(join(root, 'target', 'surefire-reports', 'TEST-New.xml'), '<testsuite tests="3" failures="1" errors="0" skipped="0"/>');
      await writeFile(join(root, 'target', 'site', 'jacoco', 'jacoco.xml'), coverageXml);
      await writeFile(join(root, args.find(arg => arg.startsWith('-Djacoco.destFile=')).split('=')[1]), Buffer.from([1, 2, 3]));
      return { exitCode: 0, timedOut: false };
    });
    assert.equal(report.status, 'failed');
    assert.equal(report.tests.passed, 2);
    assert.equal(report.coverage.line.percent, 80);
    assert.equal(report.mockitoDeclared, true);
    assert.equal(await readFile(join(root, 'pom.xml'), 'utf8'), pom);
  } finally { await cleanup(root); }
});
