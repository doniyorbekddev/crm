import { describe, expect, it } from 'vitest';
import { productionEnvIssues, type EnvRuleInput } from '../src/config/env.js';

/**
 * TZ 3.1 §45 (PHASE 21) — production env tekshiruvi: qisman provayder, webhook siri, polling, runner tokeni.
 * Qiymatlar — sinov uchun tasodifiy qatorlar (haqiqiy kalit emas).
 */
const SECRET_32 = 'a'.repeat(32);
const base: EnvRuleInput = { NODE_ENV: 'production', TELEGRAM_POLLING: false };
const paths = (values: Partial<EnvRuleInput>) => productionEnvIssues({ ...base, ...values }).map((issue) => issue.path);

describe('§45 production env qoidalari', () => {
  it('hech narsa sozlanmagan production — to‘g‘ri (hamma integratsiya o‘chiq)', () => {
    expect(paths({})).toEqual([]);
  });

  it('productionda bot bor, webhook siri yo‘q yoki qisqa — xato; yetarli bo‘lsa — to‘g‘ri', () => {
    expect(paths({ TELEGRAM_BOT_TOKEN: '123:test' })).toEqual(['TELEGRAM_WEBHOOK_SECRET']);
    expect(paths({ TELEGRAM_BOT_TOKEN: '123:test', TELEGRAM_WEBHOOK_SECRET: 'qisqa-sir' })).toEqual(['TELEGRAM_WEBHOOK_SECRET']);
    expect(paths({ TELEGRAM_BOT_TOKEN: '123:test', TELEGRAM_WEBHOOK_SECRET: SECRET_32 })).toEqual([]);
    // Ishlab chiqishda qisqa sir ruxsat (sinov qulayligi)
    expect(paths({ NODE_ENV: 'development', TELEGRAM_BOT_TOKEN: '123:test', TELEGRAM_WEBHOOK_SECRET: 'qisqa' })).toEqual([]);
  });

  it('webhook sirida Telegram qabul qilmaydigan belgi — har qanday muhitda xato', () => {
    expect(paths({ NODE_ENV: 'development', TELEGRAM_WEBHOOK_SECRET: 'sir bo‘sh joy bilan' })).toEqual(['TELEGRAM_WEBHOOK_SECRET']);
    expect(paths({ TELEGRAM_BOT_TOKEN: '123:test', TELEGRAM_WEBHOOK_SECRET: `${SECRET_32}!` })).toEqual(['TELEGRAM_WEBHOOK_SECRET']);
  });

  it('productionda polling taqiqlangan; ishlab chiqishda ruxsat', () => {
    expect(paths({ TELEGRAM_POLLING: true })).toEqual(['TELEGRAM_POLLING']);
    expect(paths({ NODE_ENV: 'development', TELEGRAM_POLLING: true })).toEqual([]);
  });

  it('Click qisman sozlangan — xato (har muhitda); to‘liq yoki bo‘sh — to‘g‘ri', () => {
    expect(paths({ CLICK_SERVICE_ID: '1', CLICK_MERCHANT_ID: '2' })).toEqual(['CLICK_SECRET_KEY']);
    expect(paths({ NODE_ENV: 'development', CLICK_SECRET_KEY: 'k' })).toEqual(['CLICK_SECRET_KEY']);
    expect(paths({ CLICK_SERVICE_ID: '1', CLICK_MERCHANT_ID: '2', CLICK_SECRET_KEY: 'k' })).toEqual([]);
  });

  it('Payme qisman sozlangan — xato; to‘liq — to‘g‘ri', () => {
    expect(paths({ PAYME_MERCHANT_ID: 'm' })).toEqual(['PAYME_KEY']);
    expect(paths({ PAYME_KEY: 'k' })).toEqual(['PAYME_KEY']);
    expect(paths({ PAYME_MERCHANT_ID: 'm', PAYME_KEY: 'k' })).toEqual([]);
  });

  it('runner URL bor — token majburiy (≥32); URL noto‘g‘ri — xato', () => {
    expect(paths({ CODE_RUNNER_URL: 'http://10.0.0.5:8080' })).toEqual(['CODE_RUNNER_TOKEN']);
    expect(paths({ CODE_RUNNER_URL: 'http://10.0.0.5:8080', CODE_RUNNER_TOKEN: 'qisqa' })).toEqual(['CODE_RUNNER_TOKEN']);
    expect(paths({ CODE_RUNNER_URL: 'http://10.0.0.5:8080', CODE_RUNNER_TOKEN: SECRET_32 })).toEqual([]);
    expect(paths({ CODE_RUNNER_URL: 'runner-server', CODE_RUNNER_TOKEN: SECRET_32 })).toEqual(['CODE_RUNNER_URL']);
  });

  it('bir nechta xato birga qaytariladi (birinchisida to‘xtamaydi)', () => {
    expect(paths({ TELEGRAM_BOT_TOKEN: '1:x', TELEGRAM_POLLING: true, PAYME_KEY: 'k', CODE_RUNNER_URL: 'http://r' }).sort()).toEqual(
      ['CODE_RUNNER_TOKEN', 'PAYME_KEY', 'TELEGRAM_POLLING', 'TELEGRAM_WEBHOOK_SECRET'].sort(),
    );
  });
});
