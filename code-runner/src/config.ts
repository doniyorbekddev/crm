/**
 * Runner sozlamasi. Token majburiy (≥ 32 belgi) — tokensiz xizmat ishga tushmaydi.
 * Runnerda CRM bazasi manzili yoki boshqa sirlar **bo'lmasligi** kerak (docs/code-sandbox.md §3).
 */
export interface RunnerConfig {
  token: string;
  port: number;
  host: string;
  runtime: string;
  concurrency: number;
  queueLimit: number;
}

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RunnerConfig {
  const token = env.CODE_RUNNER_TOKEN?.trim() ?? '';
  if (token.length < 32) throw new Error('CODE_RUNNER_TOKEN kamida 32 belgi bo‘lishi kerak');
  return {
    token,
    port: int(env.CODE_RUNNER_PORT, 4100, 1, 65535),
    host: env.CODE_RUNNER_HOST?.trim() || '0.0.0.0',
    runtime: env.CODE_RUNNER_RUNTIME?.trim() || 'runsc',
    concurrency: int(env.CODE_RUNNER_CONCURRENCY, 2, 1, 16),
    queueLimit: int(env.CODE_RUNNER_QUEUE_LIMIT, 20, 0, 500),
  };
}
