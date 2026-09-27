/** Kod sandbox (TZ 3.1 GAP-19) */
export type CodeLanguage = 'javascript' | 'typescript' | 'python' | 'html';
export type CodeRunStatus = 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR';

export interface CodeTest {
  input: string;
  expected: string;
  hidden?: boolean;
}

export interface CodeRunTest {
  index: number;
  passed: boolean;
  /** ok, error, timeout, memory, output_limit */
  status: string;
  timeMs: number;
  hidden: boolean;
  input: string | null;
  expected: string | null;
  stdout: string | null;
  stderr: string | null;
}

export interface CodeRun {
  id: string;
  status: CodeRunStatus;
  language: string;
  passed: number | null;
  total: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  tests: CodeRunTest[];
}
