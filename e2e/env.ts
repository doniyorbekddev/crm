import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';

export const ROOT_DIR = path.resolve(__dirname, '..');
export const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
export const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');

export const API_PORT = Number(process.env.E2E_API_PORT ?? 4100);
/** E2E serveridagi Telegram webhook siri (haqiqiy bot bilan aloqasi yo'q) */
export const E2E_WEBHOOK_SECRET = 'e2e-telegram-webhook-secret-0123456789';
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174);

function backendEnv(): Record<string, string> {
  const file = path.join(BACKEND_DIR, '.env');
  return existsSync(file) ? parse(readFileSync(file)) : {};
}

/**
 * E2E bazasi. `E2E_DATABASE_URL` berilmasa, backend/.env dagi DATABASE_URL dan `crm_e2e` nomi bilan olinadi.
 * Har ishga tushishda baza qaytadan yaratiladi, shuning uchun nomida "e2e" bo'lishi shart.
 */
export function e2eDatabaseUrl(): string {
  const fileEnv = backendEnv();
  const explicit = process.env.E2E_DATABASE_URL?.trim();
  let value = explicit;
  if (!value) {
    const development = process.env.DATABASE_URL?.trim() || fileEnv.DATABASE_URL?.trim();
    if (!development) {
      throw new Error('E2E_DATABASE_URL yoki backend/.env dagi DATABASE_URL topilmadi');
    }
    const url = new URL(development);
    url.pathname = '/crm_e2e';
    value = url.toString();
  }

  const databaseName = new URL(value).pathname.slice(1);
  if (!/^[a-z0-9_]*e2e[a-z0-9_]*$/.test(databaseName)) {
    throw new Error(`E2E bazasi nomida "e2e" bo'lishi va faqat kichik harf, raqam, "_" dan iborat bo'lishi kerak (hozir: "${databaseName}")`);
  }
  const protectedUrls = [fileEnv.DATABASE_URL, fileEnv.TEST_DATABASE_URL, process.env.TEST_DATABASE_URL]
    .filter((item): item is string => Boolean(item))
    .map((item) => new URL(item).pathname);
  if (protectedUrls.includes(`/${databaseName}`)) {
    throw new Error('E2E bazasi development yoki test bazasi bilan bir xil bo‘lmasligi kerak');
  }
  return value;
}
