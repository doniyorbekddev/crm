import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/database.js';
import { buildEvent, scrub } from '../src/utils/errorTracker.js';
import { metrics, renderMetrics, resetMetrics } from '../src/utils/metrics.js';
import { hasTestDatabase } from './helpers/db.js';

/**
 * PHASE 14 — kuzatuv (TZ 3.0 §68): Prometheus metrikalari (API, DB, AI, bildirishnoma, Telegram,
 * navbat), `/metrics` himoyasi, xato kuzatuvida shaxsiy ma'lumot yashirilishi.
 */
const app = createApp();

describe('Metrikalar va xato kuzatuvi', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Prometheus formati: hisoblagich, gistogramma (bucket, sum, count), yorliq ekranlash', async () => {
    resetMetrics();
    metrics.httpDuration.observe({ method: 'GET', route: '/api/students/:id', status: '2xx' }, 0.07);
    metrics.httpDuration.observe({ method: 'GET', route: '/api/students/:id', status: '2xx' }, 0.3);
    metrics.aiErrors.inc({ purpose: 'student_analysis', reason: 'schema' });
    metrics.telegramFailures.inc({ method: 'sendMessage' }, 2);
    const text = await renderMetrics();
    expect(text).toContain('# TYPE crm_http_request_duration_seconds histogram');
    expect(text).toContain('crm_http_request_duration_seconds_bucket{method="GET",route="/api/students/:id",status="2xx",le="0.1"} 1');
    expect(text).toContain('crm_http_request_duration_seconds_bucket{method="GET",route="/api/students/:id",status="2xx",le="+Inf"} 2');
    expect(text).toContain('crm_http_request_duration_seconds_count{method="GET",route="/api/students/:id",status="2xx"} 2');
    expect(text).toContain('crm_ai_errors_total{purpose="student_analysis",reason="schema"} 1');
    expect(text).toContain('crm_telegram_failures_total{method="sendMessage"} 2');
    expect(text).toContain('crm_process_uptime_seconds');
  });

  it('/metrics METRICS_TOKEN sozlanmagan bo‘lsa yopiq (404)', async () => {
    expect((await request(app).get('/metrics')).status).toBe(404);
    expect((await request(app).get('/metrics').set('Authorization', 'Bearer taxmin')).status).toBe(404);
  });

  it('/metrics token sozlanganda: noto‘g‘ri token 404, to‘g‘risi 200 (Prometheus formati)', async () => {
    const previous = env.METRICS_TOKEN;
    env.METRICS_TOKEN = 'test-metrics-token-0123456789abcdef';
    try {
      expect((await request(app).get('/metrics')).status).toBe(404);
      expect((await request(app).get('/metrics').set('Authorization', 'Bearer test-metrics-token-0123456789abcdeX')).status).toBe(404);
      // Bir xil belgi soni, lekin baytlar soni boshqa (ASCII bo'lmagan) — 500 emas, 404
      expect((await request(app).get('/metrics').set('Authorization', 'Bearer test-metrics-token-0123456789abcdeé')).status).toBe(404);
      const ok = await request(app).get('/metrics').set('Authorization', `Bearer ${env.METRICS_TOKEN}`);
      expect(ok.status).toBe(200);
      expect(ok.headers['content-type']).toContain('text/plain');
      expect(ok.text).toContain('# TYPE crm_http_request_duration_seconds histogram');
    } finally {
      env.METRICS_TOKEN = previous;
    }
  });

  it.skipIf(!hasTestDatabase)('API so‘rovi marshrut shabloni bilan o‘lchanadi (ID emas); navbat o‘lchagichi', async () => {
    resetMetrics();
    await request(app).get('/api/health');
    await request(app).get('/api/students/abc123');
    const text = await renderMetrics();
    expect(text).toMatch(/crm_http_request_duration_seconds_count\{method="GET",route="\/api\/health\/",status="2xx"\} 1/);
    expect(text).not.toContain('abc123');
    expect(text).toContain('# TYPE crm_notification_queue gauge');
    expect(text).toContain('crm_db_query_duration_seconds_count');
  });

  it('xato kuzatuvida email, telefon, token va parol yashiriladi; foydalanuvchi — faqat ID', () => {
    const cleaned = scrub('ali@example.com +998 90 123 45 67 Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.abcdefghijklmnop password=Qwerty123');
    expect(cleaned).not.toMatch(/ali@example\.com|123 45 67|eyJhbGci|Qwerty123/);
    const event = buildEvent(new Error('Topilmadi: ali@example.com'), { route: '/api/students/:id', method: 'GET', userId: 'u1' });
    expect(event.exception.values[0]!.value).toBe('Topilmadi: [email]');
    expect(event.user).toEqual({ id: 'u1' });
    expect(event.tags).toEqual({ route: '/api/students/:id', method: 'GET' });
    expect(JSON.stringify(event)).not.toContain('ali@example.com');
  });
});
