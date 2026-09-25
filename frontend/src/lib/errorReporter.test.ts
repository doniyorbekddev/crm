import { describe, expect, it } from 'vitest';
import { buildEvent, isErrorReportingEnabled, parseDsn, scrub } from './errorReporter';

describe('errorReporter', () => {
  it('DSN bo‘lmasa o‘chiq (testda VITE_SENTRY_DSN yo‘q)', () => {
    expect(isErrorReportingEnabled()).toBe(false);
  });

  it('DSN ni tahlil qiladi, noto‘g‘risini rad etadi', () => {
    expect(parseDsn('https://abc123@o1.ingest.sentry.io/42')).toEqual({ key: 'abc123', endpoint: 'https://o1.ingest.sentry.io/api/42/store/' });
    expect(parseDsn('https://o1.ingest.sentry.io/42')).toBeNull();
    expect(parseDsn('not a url')).toBeNull();
    expect(parseDsn('')).toBeNull();
  });

  it('shaxsiy ma’lumot va tokenlarni yashiradi', () => {
    const text = scrub('ali@example.com +998 90 123 45 67 Bearer abc.def token=xyz eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2Q');
    expect(text).not.toMatch(/ali@example\.com|123 45 67|abc\.def|xyz|eyJhbGci/);
    expect(text).toContain('[email]');
    expect(text).toContain('[telefon]');
  });

  it('hodisada query va shaxsiy ma’lumot yo‘q', () => {
    const event = buildEvent(new Error('ali@example.com topilmadi'), { source: 'route', path: '/students/1?q=Ali%20Valiyev' });
    expect(event.exception.values[0]!.value).toBe('[email] topilmadi');
    expect(event.tags).toEqual({ source: 'route', path: '/students/1' });
    expect(event.event_id).toMatch(/^[0-9a-f]{32}$/);
  });
});
