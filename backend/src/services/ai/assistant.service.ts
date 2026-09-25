import { prisma } from '../../config/database.js';
import type { AuthUser } from '../../types/auth.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import { permissionService } from '../permission.service.js';
import { z } from 'zod';
import { ACADEMIC_TOOLS } from './academicTools.js';
import { completeJson, llmAvailable } from './llm.js';
import { AI_TOOLS, buildContext } from './tools.js';
import type { AiTool } from './tools.js';

/**
 * AI biznes yordamchisi.
 *
 * Arxitektura: **savol → tool → mavjud servis → javob**. Til modeli (agar keyin ulansa) faqat
 * birinchi qadamda — qaysi tool mos kelishini tanlashda ishlatiladi. Ma'lumotga u hech qachon
 * tegmaydi, shuning uchun "SQL injection" yoki "keraksiz ma'lumot oqib ketishi" imkoni yo'q.
 *
 * Hozir tool tanlash **kalit so'zlar bo'yicha** ishlaydi: tashqi xizmat, API kalit va internet
 * talab qilmaydi, javob bir zumda keladi va natija takrorlanadigan (deterministik) bo'ladi.
 * Til modeli keyin qo'shilsa, u faqat shu tanlovni yaxshilaydi — {@link matchTool} o'rnini bosadi.
 */

/** Biznes (§ mavjud) + akademik (TZ 3.0 §37, §39) toollar — bitta whitelist */
export const ALL_TOOLS: readonly AiTool[] = [...AI_TOOLS, ...ACADEMIC_TOOLS];

function findAnyTool(key: string): AiTool | undefined {
  return ALL_TOOLS.find((tool) => tool.key === key);
}

const intentSchema = z.object({ toolKey: z.string().max(50).nullable() });

/**
 * §61 "Intent detection": kalit so'z topilmasa va model ulangan bo'lsa — model faqat **ruxsat
 * etilgan tool kalitlaridan birini** tanlaydi (yoki null). Ma'lumotni model ko'rmaydi; javobni
 * tool mavjud servislardan beradi.
 */
async function detectIntent(question: string, allowed: readonly AiTool[]): Promise<AiTool | null> {
  if (!llmAvailable() || allowed.length === 0) return null;
  const result = await completeJson(
    {
      system: 'Sen CRM savol yo‘naltiruvchisisan. Savolga mos keladigan bitta tool kalitini tanla. Mos kelmasa null qaytar. Faqat JSON.',
      prompt: `Toollar:\n${allowed.map((tool) => `- ${tool.key}: ${tool.title} (masalan: ${tool.samples[0]})`).join('\n')}\n\nSavol: ${question}\nQaytar: {"toolKey": "kalit" | null}`,
      maxTokens: 60,
    },
    intentSchema,
    'assistant_intent',
  );
  const key = result?.data.toolKey;
  return key ? (allowed.find((tool) => tool.key === key) ?? null) : null;
}

/** Savolni tozalaydi: kichik harf, apostroflarni birxillashtirish, ortiqcha belgilarni olib tashlash */
export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Umumiy so'zlar: ular yolg'iz o'zi savolni aniqlamaydi ("bugun ob-havo qanday" — bu CRM savoli emas).
 * Shuning uchun ular yarim ball oladi va faqat boshqa signal bilan birga ishlaydi.
 */
const WEAK_KEYWORDS = new Set(['bugun', 'oy', 'hafta', 'pul', 'lead', 'kurs', 'manba', 'baho', 'fikr', 'vazifa']);

/** Tool tanlanishi uchun kerakli eng kam ball */
const MIN_SCORE = 1;

export interface ToolMatch {
  tool: AiTool;
  /** Nechta kalit so'z mos kelgani — tanlov sababini ko'rsatish uchun */
  score: number;
  matched: string[];
}

/**
 * Savolga eng mos toolni topadi. Mos kelgan kalit so'zlar soni bo'yicha eng yuqorisi tanlanadi;
 * uzunroq kalit so'z ustunroq (masalan "o'tgan oy" — "oy" dan muhimroq).
 */
export function matchTool(question: string, tools: readonly AiTool[] = ALL_TOOLS): ToolMatch | null {
  const text = normalizeQuestion(question);
  if (text.length < 3) return null;

  let best: ToolMatch | null = null;
  for (const tool of tools) {
    const matched: string[] = [];
    let score = 0;
    for (const keyword of tool.keywords) {
      const normalized = normalizeQuestion(keyword);
      if (normalized && text.includes(normalized)) {
        matched.push(keyword);
        const words = normalized.split(' ').length;
        // Umumiy so'z — yarim ball; uzun ibora aniqroq signal beradi
        const weight = words === 1 && WEAK_KEYWORDS.has(normalized) ? 0.5 : 1;
        score += weight + Math.min(words - 1, 2);
      }
    }
    if (score < MIN_SCORE) continue;
    if (!best || score > best.score) best = { tool, score, matched };
  }
  return best;
}

export interface AiAnswerDto {
  /** Javob topildimi */
  answered: boolean;
  question: string;
  /** Qaysi tool javob bergani (topilmasa null) */
  tool: { key: string; title: string } | null;
  answer: string;
  details: string[];
  link: string | null;
  /** Javob topilmasa yoki ruxsat bo'lmasa — sabab */
  failure: string | null;
  /** Foydalanuvchi so'rashi mumkin bo'lgan savollar */
  suggestions: string[];
}

export interface AiToolInfoDto {
  key: string;
  title: string;
  samples: string[];
  /** Foydalanuvchining ruxsati yetadimi */
  allowed: boolean;
}

/** Foydalanuvchi ruxsati yetadigan toollar bo'yicha namunaviy savollar */
function suggestionsFor(permissions: ReadonlySet<string>, limit = 6): string[] {
  return ALL_TOOLS.filter((tool) => permissions.has(tool.permission))
    .flatMap((tool) => tool.samples.slice(0, 1))
    .slice(0, limit);
}

export const aiAssistantService = {
  /** Mavjud savol turlari — yordamchi oynasida taklif sifatida ko'rsatiladi */
  async tools(actor: AuthUser): Promise<AiToolInfoDto[]> {
    const permissions = await permissionService.getRolePermissions(actor.roleId);
    return ALL_TOOLS.map((tool) => ({
      key: tool.key,
      title: tool.title,
      samples: [...tool.samples],
      allowed: permissions.has(tool.permission),
    }));
  },

  /**
   * Savolga javob beradi. `toolKey` berilsa (taklifdan bosilgan bo'lsa) tanlash bosqichi
   * o'tkazib yuboriladi.
   */
  async ask(actor: AuthUser, input: { question: string; toolKey?: string | undefined }, client: ClientInfo): Promise<AiAnswerDto> {
    const started = Date.now();
    const permissions = await permissionService.getRolePermissions(actor.roleId);
    const suggestions = suggestionsFor(permissions);
    const question = input.question.trim();

    const record = async (result: {
      tool: AiTool | null;
      answer: string;
      failure: string | null;
    }): Promise<void> => {
      await prisma.aiQuery.create({
        data: {
          userId: actor.id,
          question: question.slice(0, 500),
          toolKey: result.tool?.key ?? null,
          params: { branchId: actor.branchId ?? null, ip: client.ip ?? null },
          answer: result.answer.slice(0, 1000) || null,
          failure: result.failure?.slice(0, 255) ?? null,
          // SmallInt: juda uzoq so'rovda ham chegaradan oshmasin
          durationMs: Math.min(Date.now() - started, 32_000),
        },
      });
    };

    const selected = input.toolKey
      ? findAnyTool(input.toolKey)
      : (matchTool(question)?.tool ?? (await detectIntent(question, ALL_TOOLS.filter((tool) => permissions.has(tool.permission)))));

    if (!selected) {
      const failure = 'Savol tushunilmadi';
      await record({ tool: null, answer: '', failure });
      return {
        answered: false,
        question,
        tool: null,
        answer: 'Savolni tushunmadim. Quyidagi savollardan birini tanlang yoki boshqacha yozing.',
        details: [],
        link: null,
        failure,
        suggestions,
      };
    }

    if (!permissions.has(selected.permission)) {
      const failure = 'Ruxsat yetarli emas';
      await record({ tool: selected, answer: '', failure });
      return {
        answered: false,
        question,
        tool: { key: selected.key, title: selected.title },
        // Ma'lumot bor-yo'qligi oshkor qilinmaydi — faqat ruxsat yo'qligi aytiladi
        answer: 'Bu savolga javob berish uchun sizda ruxsat yo‘q.',
        details: [],
        link: null,
        failure,
        suggestions,
      };
    }

    const context = await buildContext(actor, permissions);
    const result = await selected.run(context);
    await record({ tool: selected, answer: result.answer, failure: null });

    return {
      answered: true,
      question,
      tool: { key: selected.key, title: selected.title },
      answer: result.answer,
      details: result.details ?? [],
      link: result.link ?? null,
      failure: null,
      suggestions,
    };
  },

  /** So'nggi savollar — audit va "nimani ko'p so'rashadi?" uchun */
  async history(actor: AuthUser, limit = 20): Promise<Array<{ id: string; question: string; answer: string | null; toolKey: string | null; createdAt: string }>> {
    const rows = await prisma.aiQuery.findMany({
      where: { userId: actor.id },
      select: { id: true, question: true, answer: true, toolKey: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  },
};
