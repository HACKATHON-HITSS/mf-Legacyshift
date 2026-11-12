export type JavaTestResult = {
  agent: string; projectPath: string; checkedAt: string;
  status: 'passed' | 'failed' | 'no_tests' | 'build_failed' | 'timeout' | 'not_configured' | 'not_applicable';
  tests: { tests: number; failures: number; errors: number; skipped: number; passed: number };
  coverage: { line?: { covered: number; missed: number; percent: number | null }; branch?: { covered: number; missed: number; percent: number | null } } | null;
  mockitoDeclared: boolean; coverageFiles: string[]; conclusion: string; limitations: string;
};
