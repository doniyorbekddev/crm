import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { completeJson, groqClient, pickClient, setLlmClient } from '../src/services/ai/llm.js';

const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('AI: Groq (bepul muqobil)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setLlmClient(undefined);
  });

  it('kalitga qarab mijoz tanlanadi: Claude ustuvor, kalit yo‘q — qoidalar rejimi', () => {
    expect(pickClient({})).toBeNull();
    expect(pickClient({ groq: 'g' })).toBe(groqClient);
    expect(pickClient({ anthropic: 'a', groq: 'g' })).not.toBe(groqClient);
  });

  it('so‘rov Groq formatida ketadi va JSON javob sxema bilan o‘qiladi', async () => {
    const fetchMock = vi.fn(async () => answer(200, { model: 'openai/gpt-oss-120b', choices: [{ message: { content: '\u0060\u0060\u0060json\n{"note":"yaxshi"}\n\u0060\u0060\u0060' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    vi.stubGlobal('fetch', fetchMock);
    setLlmClient(groqClient);
    const result = await completeJson({ system: 'tizim', prompt: 'savol', maxTokens: 500 }, z.object({ note: z.string() }), 'test');
    expect(result).toMatchObject({ data: { note: 'yaxshi' }, inputTokens: 10, outputTokens: 5 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    const sent = JSON.parse(init.body) as { messages: { role: string }[]; max_completion_tokens: number; reasoning_effort?: string };
    expect(sent.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(sent.max_completion_tokens).toBe(1300);
    expect(sent.reasoning_effort).toBe('low');
  });

  it('limit tugasa (429) yiqilmaydi — qoidalar natijasiga qaytadi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer(429, { error: { message: 'rate limit' } })));
    setLlmClient(groqClient);
    await expect(completeJson({ system: 's', prompt: 'p' }, z.object({ note: z.string() }), 'test')).resolves.toBeNull();
  });
});
