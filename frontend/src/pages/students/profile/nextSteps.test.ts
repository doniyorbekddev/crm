import { describe, expect, it } from 'vitest';
import { buildNextSteps } from './NextStepsCard';

const noop = () => undefined;
const open = { message: noop, calendar: noop };
const can = { message: true, attendance: true };

describe('o‘quvchi profili — keyingi qadamlar', () => {
  it('barqaror va davomati yaxshi o‘quvchi — qadam yo‘q', () => {
    expect(buildNextSteps({ riskLevel: 'HEALTHY', attendance: { total: 20, rate: 95 }, can, open })).toEqual([]);
  });

  it('xavf va past davomat — muhimlik tartibida', () => {
    const steps = buildNextSteps({ riskLevel: 'CRITICAL', attendance: { total: 10, rate: 60 }, can, open });
    expect(steps.map((step) => step.key)).toEqual(['risk', 'attendance']);
    expect(steps[0]!.text).toContain('Kritik');
  });

  it('ruxsat bo‘lmasa yoki dars bo‘lmasa qadam ko‘rsatilmaydi', () => {
    expect(
      buildNextSteps({ riskLevel: 'AT_RISK', attendance: { total: 0, rate: 0 }, can: { message: false, attendance: true }, open }),
    ).toEqual([]);
  });
});
