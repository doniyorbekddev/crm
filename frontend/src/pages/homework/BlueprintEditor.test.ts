import { describe, expect, it } from 'vitest';
import { blueprintDraftFrom, blueprintFromDraft } from './BlueprintEditor';

/** Blueprint formasi → API: ulushlar 100% bo'lishi, mavzu takrorlanmasligi (server ham tekshiradi) */
describe('blueprint qoralamasi', () => {
  it('o‘chirilgan blueprint — null; qayta ochilganda saqlangan qiymat tiklanadi', () => {
    expect(blueprintFromDraft(blueprintDraftFrom(null))).toEqual({ value: null, error: null });
    const saved = { total: 10, topics: [{ topicId: 't1', percent: 60 }, { topicId: 't2', percent: 40 }], difficulty: { EASY: 30, MEDIUM: 50, HARD: 20 } };
    expect(blueprintFromDraft(blueprintDraftFrom(saved))).toEqual({ value: saved, error: null });
  });

  it('ulushlar va savollar soni tekshiriladi, bo‘sh mavzu qatori tashlab ketiladi', () => {
    const base = { ...blueprintDraftFrom(null), enabled: true };
    expect(blueprintFromDraft({ ...base, total: '0' }).error).toContain('1–100');
    expect(blueprintFromDraft({ ...base, topics: [{ topicId: 'a', percent: '60' }, { topicId: 'b', percent: '30' }] }).error).toContain('hozir 90%');
    expect(blueprintFromDraft({ ...base, topics: [{ topicId: 'a', percent: '50' }, { topicId: 'a', percent: '50' }] }).error).toContain('takrorlanmasin');
    expect(blueprintFromDraft({ ...base, useDifficulty: true, difficulty: { EASY: '50', MEDIUM: '40', HARD: '20' } }).error).toContain('hozir 110%');
    expect(blueprintFromDraft({ ...base, total: '5', topics: [{ topicId: '', percent: '' }, { topicId: 'a', percent: '100' }] }).value).toEqual({ total: 5, topics: [{ topicId: 'a', percent: 100 }] });
  });
});
