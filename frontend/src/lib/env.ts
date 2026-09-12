function normalizeApiUrl(value: string | undefined): string {
  const url = value && value.trim().length > 0 ? value.trim() : '/api';
  return url.replace(/\/+$/, '');
}

function normalizeAppName(value: string | undefined): string {
  return value && value.trim().length > 0 ? value.trim() : 'Sales CRM';
}

export const appEnv = {
  apiUrl: normalizeApiUrl(import.meta.env.VITE_API_URL),
  appName: normalizeAppName(import.meta.env.VITE_APP_NAME),
} as const;
