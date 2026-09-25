import type { z } from 'zod';
import { env, isTest } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { metrics } from '../../utils/metrics.js';

/**
 * Til modeli qatlami (Claude API). **Ixtiyoriy**: `ANTHROPIC_API_KEY` bo'lmasa `llmAvailable()`
 * false va barcha AI akademik funksiyalar qoidalar rejimida ishlaydi (TZ: graceful fallback).
 *
 * Xavfsizlik (§58–60):
 *  - model ma'lumot bazasiga tegmaydi — faqat chaqiruvchi yig'gan, kerakli maydonlar yuboriladi;
 *  - javob **JSON sxema** bilan tekshiriladi; mos kelmasa yoki xato bo'lsa `null` (qoidalar natijasi qoladi);
 *  - log'ga prompt matni yozilmaydi (faqat model, tokenlar, davomiylik, xato turi).
 */

export interface LlmRequest {
  system: string;
  /** Foydalanuvchi xabari — odatda JSON ma'lumot + vazifa */
  prompt: string;
  maxTokens?: number;
}

export interface LlmResponse {
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export type LlmClient = (request: LlmRequest) => Promise<LlmResponse>;

const API_URL = 'https://api.anthropic.com/v1/messages';

async function anthropicClient(request: LlmRequest): Promise<LlmResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        max_tokens: request.maxTokens ?? 1200,
        system: request.system,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    });
    if (!response.ok) throw new Error(`Claude API ${response.status}`);
    const body = (await response.json()) as {
      model?: string;
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (body.content ?? [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('');
    return { text, model: body.model ?? env.AI_MODEL, inputTokens: body.usage?.input_tokens ?? null, outputTokens: body.usage?.output_tokens ?? null };
  } finally {
    clearTimeout(timer);
  }
}

let override: LlmClient | null | undefined;

/** Testlar uchun: soxta klient (`null` — "ulanmagan" holati), `undefined` — standart */
export function setLlmClient(client: LlmClient | null | undefined): void {
  override = client;
}

function activeClient(): LlmClient | null {
  if (override !== undefined) return override;
  // Testlarda haqiqiy API hech qachon chaqirilmaydi
  if (isTest || !env.ANTHROPIC_API_KEY) return null;
  return anthropicClient;
}

export function llmAvailable(): boolean {
  return activeClient() !== null;
}

/** Matndan birinchi JSON obyektini ajratadi (model ba'zan ``` bilan o'raydi) */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export interface LlmJsonResult<T> {
  data: T;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * Modeldan sxemaga mos JSON so'raydi. Ulanmagan, xato, vaqt tugashi yoki sxemaga mos kelmasa —
 * `null` (chaqiruvchi qoidalar natijasini ishlatadi). Hech qachon throw qilmaydi.
 */
export async function completeJson<T>(request: LlmRequest, schema: z.ZodType<T>, purpose: string): Promise<LlmJsonResult<T> | null> {
  const client = activeClient();
  if (!client) return null;
  const started = Date.now();
  try {
    const response = await client(request);
    metrics.aiDuration.observe({ purpose }, (Date.now() - started) / 1000);
    const parsed = schema.safeParse(extractJson(response.text));
    if (!parsed.success) {
      metrics.aiErrors.inc({ purpose, reason: 'schema' });
      logger.warn({ purpose, model: response.model, durationMs: Date.now() - started }, 'AI javobi sxemaga mos kelmadi — qoidalar natijasi ishlatildi');
      return null;
    }
    logger.info({ purpose, model: response.model, inputTokens: response.inputTokens, outputTokens: response.outputTokens, durationMs: Date.now() - started }, 'AI tahlil');
    return { data: parsed.data, model: response.model, inputTokens: response.inputTokens, outputTokens: response.outputTokens };
  } catch (error) {
    metrics.aiErrors.inc({ purpose, reason: 'request' });
    logger.warn({ purpose, err: error instanceof Error ? error.message : 'unknown', durationMs: Date.now() - started }, 'AI xizmati javob bermadi — qoidalar natijasi ishlatildi');
    return null;
  }
}

/** Barcha akademik so'rovlar uchun umumiy tizim ko'rsatmasi (§60: fakt / kuzatuv / tavsiya) */
export const ACADEMIC_SYSTEM_PROMPT = [
  'Sen o‘quv markazining akademik tahlilchisisan. O‘zbek tilida (lotin), qisqa va aniq yoz.',
  'FAQAT berilgan ma’lumotdan foydalan. Berilmagan raqam, sana, ism yoki fakt o‘ylab topma.',
  'Faktlar allaqachon berilgan — ularni takrorlama. Sening vazifang: kuzatuvlar (OBSERVATION) va tavsiyalar (RECOMMENDATION).',
  'Hukm chiqarma (masalan "ko‘chirgan", "dangasa"). Yumshoq, hurmatli va amaliy ohangda yoz.',
  'Yakuniy qaror o‘qituvchida — tavsiyalar taklif sifatida yozilsin.',
  'Javobni FAQAT so‘ralgan JSON formatida qaytar, boshqa matn qo‘shma.',
].join('\n');
