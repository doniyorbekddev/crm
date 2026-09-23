import { prisma } from '../config/database.js';
import type { DiscountType, DiscountValueType, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { moneyUz } from '../utils/money.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';

/**
 * Chegirma dvigateli — qoida asosida ishlaydigan chegirmalar.
 *
 * Tamoyillar:
 *  - **Bitta manba:** chegirma har doim `StudentDiscount` yozuvi bo'lib, shartnoma narxini
 *    kamaytiradi va qarzdorlikni qayta hisoblaydi. Qo'lda narx yozish o'rniga shu yo'l ishlatiladi,
 *    shunda "nega bu o'quvchi kamroq to'laydi?" degan savolga javob doim bor.
 *  - **Nusxa:** berilgan chegirma qoidadan qiymatni nusxa qilib oladi. Qoida keyin o'zgarsa
 *    berilgan chegirma o'zgarmaydi.
 *  - **O'chirilmaydi:** chegirma bekor qilinadi (`revokedAt`), summa shartnomaga qaytariladi.
 *  - **Foiz boshlang'ich narxdan:** ikki chegirma bir-birining ustiga tushmaydi — ikkalasi ham
 *    shartnomaning chegirmasiz narxidan hisoblanadi, shuning uchun tartib natijaga ta'sir qilmaydi.
 *  - **Chegara:** umumiy chegirma sozlamadagi foizdan oshmaydi.
 */

export const DISCOUNT_SETTINGS_KEY = 'discount.settings';

export interface DiscountSettings {
  /** Bitta o'quvchiga berilishi mumkin bo'lgan umumiy chegirma (shartnoma narxining foizi) */
  maxPercent: number;
  /** Bir nechta chegirmani birga qo'llashga ruxsat */
  allowStacking: boolean;
}

export const DEFAULT_DISCOUNT_SETTINGS: DiscountSettings = {
  maxPercent: 30,
  allowStacking: true,
};

export interface DiscountSettingsDto extends DiscountSettings {
  updatedAt: string | null;
}

export async function loadDiscountSettings(): Promise<DiscountSettings> {
  const row = await prisma.setting.findUnique({ where: { key: DISCOUNT_SETTINGS_KEY }, select: { value: true } });
  const saved = (row?.value ?? {}) as Partial<DiscountSettings>;
  const maxPercent = typeof saved.maxPercent === 'number' ? saved.maxPercent : DEFAULT_DISCOUNT_SETTINGS.maxPercent;
  return {
    maxPercent: Math.min(Math.max(maxPercent, 0), 100),
    allowStacking: typeof saved.allowStacking === 'boolean' ? saved.allowStacking : DEFAULT_DISCOUNT_SETTINGS.allowStacking,
  };
}

const ruleSelect = {
  id: true,
  key: true,
  name: true,
  type: true,
  valueType: true,
  value: true,
  stackable: true,
  priority: true,
  isActive: true,
  sortOrder: true,
  startsAt: true,
  endsAt: true,
  description: true,
  _count: { select: { discounts: true } },
} satisfies Prisma.DiscountRuleSelect;

export interface DiscountRuleDto {
  id: string;
  key: string;
  name: string;
  type: DiscountType;
  valueType: DiscountValueType;
  value: number;
  stackable: boolean;
  priority: number;
  isActive: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  description: string | null;
  /** Nechta o'quvchiga berilgan */
  usedCount: number;
}

function toRuleDto(record: Prisma.DiscountRuleGetPayload<{ select: typeof ruleSelect }>): DiscountRuleDto {
  return {
    id: record.id,
    key: record.key,
    name: record.name,
    type: record.type,
    valueType: record.valueType,
    value: record.value.toNumber(),
    stackable: record.stackable,
    priority: record.priority,
    isActive: record.isActive,
    sortOrder: record.sortOrder,
    startsAt: record.startsAt?.toISOString() ?? null,
    endsAt: record.endsAt?.toISOString() ?? null,
    description: record.description,
    usedCount: record._count.discounts,
  };
}

const promoSelect = {
  id: true,
  code: true,
  ruleId: true,
  usageLimit: true,
  usedCount: true,
  expiresAt: true,
  isActive: true,
  note: true,
  createdAt: true,
  rule: { select: { key: true, name: true, valueType: true, value: true } },
} satisfies Prisma.PromoCodeSelect;

export interface PromoCodeDto {
  id: string;
  code: string;
  ruleId: string;
  ruleName: string;
  valueType: DiscountValueType;
  value: number;
  usageLimit: number;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  note: string | null;
  createdAt: string;
}

function toPromoDto(record: Prisma.PromoCodeGetPayload<{ select: typeof promoSelect }>): PromoCodeDto {
  return {
    id: record.id,
    code: record.code,
    ruleId: record.ruleId,
    ruleName: record.rule.name,
    valueType: record.rule.valueType,
    value: record.rule.value.toNumber(),
    usageLimit: record.usageLimit,
    usedCount: record.usedCount,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    isActive: record.isActive,
    note: record.note,
    createdAt: record.createdAt.toISOString(),
  };
}

const discountSelect = {
  id: true,
  studentId: true,
  label: true,
  type: true,
  valueType: true,
  value: true,
  amount: true,
  note: true,
  createdAt: true,
  revokedAt: true,
  revokeReason: true,
  rule: { select: { key: true } },
  promoCode: { select: { code: true } },
  grantedBy: { select: { firstName: true, lastName: true } },
  revokedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.StudentDiscountSelect;

export interface StudentDiscountDto {
  id: string;
  studentId: string;
  label: string;
  type: DiscountType;
  valueType: DiscountValueType;
  value: number;
  amount: number;
  note: string | null;
  ruleKey: string | null;
  promoCode: string | null;
  grantedBy: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
}

function toDiscountDto(record: Prisma.StudentDiscountGetPayload<{ select: typeof discountSelect }>): StudentDiscountDto {
  const person = (value: { firstName: string; lastName: string } | null) => (value ? `${value.firstName} ${value.lastName}` : null);
  return {
    id: record.id,
    studentId: record.studentId,
    label: record.label,
    type: record.type,
    valueType: record.valueType,
    value: record.value.toNumber(),
    amount: record.amount.toNumber(),
    note: record.note,
    ruleKey: record.rule?.key ?? null,
    promoCode: record.promoCode?.code ?? null,
    grantedBy: person(record.grantedBy),
    createdAt: record.createdAt.toISOString(),
    revokedAt: record.revokedAt?.toISOString() ?? null,
    revokedBy: person(record.revokedBy),
    revokeReason: record.revokeReason,
  };
}

/** O'quvchining chegirma holati — profil kartochkasi uchun */
export interface StudentDiscountSummary {
  studentId: string;
  /** Chegirmasiz shartnoma narxi */
  basePrice: number;
  /** Chegirmalar yig'indisi */
  discountTotal: number;
  /** Hozirgi shartnoma narxi (base - discountTotal) */
  contractPrice: number;
  /** Chegirma boshlang'ich narxning necha foizi */
  percent: number;
  /** Sozlamadagi chegara */
  maxPercent: number;
  /** Shu chegaragacha yana qancha chegirma berish mumkin */
  remainingAllowance: number;
  items: StudentDiscountDto[];
}

/** Foizni butun so'mga aylantiradi (tiyin ishlatilmaydi) */
function amountFor(base: number, valueType: DiscountValueType, value: number): number {
  return valueType === 'PERCENT' ? Math.round((base * value) / 100) : Math.round(value);
}

interface ResolvedDiscount {
  label: string;
  type: DiscountType;
  valueType: DiscountValueType;
  value: number;
  ruleId: string | null;
  promoCodeId: string | null;
  stackable: boolean;
}

export interface GrantDiscountInput {
  ruleKey?: string | undefined;
  promoCode?: string | undefined;
  /** Qoidasiz (CUSTOM) chegirma uchun */
  valueType?: DiscountValueType | undefined;
  value?: number | undefined;
  label?: string | undefined;
  note?: string | undefined;
}

async function resolveInput(input: GrantDiscountInput, now: Date): Promise<ResolvedDiscount> {
  if (input.promoCode) {
    const code = input.promoCode.trim().toUpperCase();
    const promo = await prisma.promoCode.findUnique({
      where: { code },
      select: { id: true, isActive: true, usageLimit: true, usedCount: true, expiresAt: true, rule: { select: ruleSelect } },
    });
    if (!promo || !promo.isActive) throw AppError.unprocessable('Promo kod topilmadi yoki faol emas');
    if (promo.expiresAt && promo.expiresAt.getTime() < now.getTime()) throw AppError.unprocessable('Promo kod muddati tugagan');
    if (promo.usageLimit > 0 && promo.usedCount >= promo.usageLimit) throw AppError.unprocessable('Promo kod ishlatilish chegarasiga yetgan');
    const rule = promo.rule;
    if (!rule.isActive) throw AppError.unprocessable('Bu kodga bog‘langan chegirma qoidasi o‘chirilgan');
    return {
      label: `${rule.name} (${code})`,
      type: rule.type,
      valueType: rule.valueType,
      value: rule.value.toNumber(),
      ruleId: rule.id,
      promoCodeId: promo.id,
      stackable: rule.stackable,
    };
  }

  if (input.ruleKey) {
    const rule = await prisma.discountRule.findUnique({ where: { key: input.ruleKey }, select: ruleSelect });
    if (!rule || !rule.isActive) throw AppError.unprocessable('Chegirma qoidasi topilmadi yoki faol emas');
    if (rule.startsAt && rule.startsAt.getTime() > now.getTime()) throw AppError.unprocessable('Bu qoida hali boshlanmagan');
    if (rule.endsAt && rule.endsAt.getTime() < now.getTime()) throw AppError.unprocessable('Bu qoidaning muddati tugagan');
    return {
      label: rule.name,
      type: rule.type,
      valueType: rule.valueType,
      value: rule.value.toNumber(),
      ruleId: rule.id,
      promoCodeId: null,
      stackable: rule.stackable,
    };
  }

  // Qoidasiz chegirma — sabab majburiy, chunki keyin "kim va nega berdi?" degan savol tug'iladi
  if (input.value === undefined || !input.valueType) {
    throw AppError.unprocessable('Chegirma qoidasi yoki qiymati ko‘rsatilmagan');
  }
  if (!input.note || input.note.trim().length < 3) {
    throw AppError.unprocessable('Qo‘lda chegirma uchun sabab yozilishi shart', [{ field: 'note', message: 'Sababni yozing' }]);
  }
  return {
    label: input.label?.trim() || 'Maxsus chegirma',
    type: 'CUSTOM',
    valueType: input.valueType,
    value: input.value,
    ruleId: null,
    promoCodeId: null,
    stackable: true,
  };
}

async function loadStudentForDiscount(studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: {
      id: true,
      contractPrice: true,
      discountTotal: true,
      debt: { select: { paidAmount: true } },
      discounts: { where: { revokedAt: null }, select: { id: true, label: true, amount: true, ruleId: true, type: true } },
    },
  });
  if (!student) throw AppError.notFound('O‘quvchi topilmadi');
  return student;
}

function debtStatusOf(total: number, paid: number): 'UNPAID' | 'PARTIAL' | 'PAID' {
  if (paid <= 0) return 'UNPAID';
  return paid >= total ? 'PAID' : 'PARTIAL';
}

/** Shartnoma narxi o'zgargach qarzdorlikni moslaydi (to'langan summa tegilmaydi) */
async function syncDebt(tx: Prisma.TransactionClient, studentId: string, contractPrice: number, paid: number): Promise<void> {
  await tx.debt.updateMany({
    where: { studentId },
    data: {
      totalAmount: contractPrice,
      remainingAmount: Math.max(contractPrice - paid, 0),
      status: debtStatusOf(contractPrice, paid),
    },
  });
}

export const discountService = {
  async settings(): Promise<DiscountSettingsDto> {
    const row = await prisma.setting.findUnique({ where: { key: DISCOUNT_SETTINGS_KEY }, select: { updatedAt: true } });
    return { ...(await loadDiscountSettings()), updatedAt: row?.updatedAt.toISOString() ?? null };
  },

  async saveSettings(actor: AuthUser, input: DiscountSettings, client: ClientInfo): Promise<DiscountSettingsDto> {
    await prisma.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key: DISCOUNT_SETTINGS_KEY },
        update: { value: input as unknown as Prisma.InputJsonValue, updatedById: actor.id },
        create: { key: DISCOUNT_SETTINGS_KEY, value: input as unknown as Prisma.InputJsonValue, description: 'Chegirma chegaralari', updatedById: actor.id },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'discount.settings_updated',
        entityType: 'settings',
        entityId: DISCOUNT_SETTINGS_KEY,
        metadata: { ...input },
        ...client,
      });
    });
    return this.settings();
  },

  async listRules(includeInactive = false): Promise<DiscountRuleDto[]> {
    const rules = await prisma.discountRule.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: ruleSelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rules.map(toRuleDto);
  },

  async saveRule(
    actor: AuthUser,
    input: {
      key: string;
      name: string;
      type: DiscountType;
      valueType: DiscountValueType;
      value: number;
      stackable: boolean;
      priority: number;
      isActive: boolean;
      sortOrder: number;
      startsAt?: Date | undefined;
      endsAt?: Date | undefined;
      description?: string | undefined;
    },
    client: ClientInfo,
  ): Promise<DiscountRuleDto> {
    if (input.valueType === 'PERCENT' && input.value > 100) {
      throw AppError.unprocessable('Foiz 100 dan oshmasin', [{ field: 'value', message: 'Foiz 100 dan oshmasin' }]);
    }
    if (input.startsAt && input.endsAt && input.startsAt.getTime() > input.endsAt.getTime()) {
      throw AppError.unprocessable('Boshlanish sanasi tugash sanasidan keyin', [{ field: 'endsAt', message: 'Tugash sanasi keyinroq bo‘lsin' }]);
    }

    const data = {
      name: input.name,
      type: input.type,
      valueType: input.valueType,
      value: input.value,
      stackable: input.stackable,
      priority: input.priority,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      description: input.description ?? null,
    };

    const rule = await prisma.$transaction(async (tx) => {
      const saved = await tx.discountRule.upsert({
        where: { key: input.key },
        update: data,
        create: { key: input.key, ...data },
        select: ruleSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'discount.rule_saved',
        entityType: 'settings',
        entityId: saved.id,
        metadata: { key: input.key, value: input.value, valueType: input.valueType, isActive: input.isActive },
        ...client,
      });
      return saved;
    });
    return toRuleDto(rule);
  },

  async listPromoCodes(includeInactive = false): Promise<PromoCodeDto[]> {
    const codes = await prisma.promoCode.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: promoSelect,
      orderBy: { createdAt: 'desc' },
    });
    return codes.map(toPromoDto);
  },

  async createPromoCode(
    actor: AuthUser,
    input: { code: string; ruleKey: string; usageLimit: number; expiresAt?: Date | undefined; note?: string | undefined },
    client: ClientInfo,
  ): Promise<PromoCodeDto> {
    const code = input.code.trim().toUpperCase();
    const rule = await prisma.discountRule.findUnique({ where: { key: input.ruleKey }, select: { id: true } });
    if (!rule) throw AppError.unprocessable('Chegirma qoidasi topilmadi', [{ field: 'ruleKey', message: 'Qoida topilmadi' }]);
    const exists = await prisma.promoCode.findUnique({ where: { code }, select: { id: true } });
    if (exists) throw AppError.conflict('Bu kod allaqachon mavjud');

    const promo = await prisma.$transaction(async (tx) => {
      const created = await tx.promoCode.create({
        data: {
          code,
          ruleId: rule.id,
          usageLimit: input.usageLimit,
          expiresAt: input.expiresAt ?? null,
          note: input.note ?? null,
          createdById: actor.id,
        },
        select: promoSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'discount.promo_created',
        entityType: 'settings',
        entityId: created.id,
        metadata: { code, ruleKey: input.ruleKey, usageLimit: input.usageLimit },
        ...client,
      });
      return created;
    });
    return toPromoDto(promo);
  },

  async setPromoCodeActive(actor: AuthUser, id: string, isActive: boolean, client: ClientInfo): Promise<PromoCodeDto> {
    const promo = await prisma.promoCode.findUnique({ where: { id }, select: { id: true, code: true } });
    if (!promo) throw AppError.notFound('Promo kod topilmadi');
    const saved = await prisma.$transaction(async (tx) => {
      const updated = await tx.promoCode.update({ where: { id }, data: { isActive }, select: promoSelect });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: isActive ? 'discount.promo_enabled' : 'discount.promo_disabled',
        entityType: 'settings',
        entityId: id,
        metadata: { code: promo.code },
        ...client,
      });
      return updated;
    });
    return toPromoDto(saved);
  },

  /** O'quvchining chegirmalari va qancha chegirma berish mumkinligi */
  async forStudent(studentId: string): Promise<StudentDiscountSummary> {
    const student = await prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true, contractPrice: true, discountTotal: true },
    });
    if (!student) throw AppError.notFound('O‘quvchi topilmadi');
    const items = await prisma.studentDiscount.findMany({
      where: { studentId },
      select: discountSelect,
      orderBy: { createdAt: 'desc' },
    });
    const settings = await loadDiscountSettings();
    const contractPrice = student.contractPrice.toNumber();
    const discountTotal = student.discountTotal.toNumber();
    const basePrice = contractPrice + discountTotal;
    const allowed = Math.round((basePrice * settings.maxPercent) / 100);

    return {
      studentId,
      basePrice,
      discountTotal,
      contractPrice,
      percent: basePrice > 0 ? Math.round((discountTotal / basePrice) * 1000) / 10 : 0,
      maxPercent: settings.maxPercent,
      remainingAllowance: Math.max(allowed - discountTotal, 0),
      items: items.map(toDiscountDto),
    };
  },

  /**
   * Chegirmani hisoblaydi va cheklovlarni tekshiradi. Yozmaydi — forma oldindan ko'rsatishi uchun
   * ham, `grant()` ichida ham shu funksiya ishlatiladi (qoida bitta joyda).
   */
  async evaluate(
    studentId: string,
    input: GrantDiscountInput,
    now: Date = new Date(),
  ): Promise<{ resolved: ResolvedDiscount; amount: number; basePrice: number; newContractPrice: number }> {
    const [student, settings, resolved] = await Promise.all([
      loadStudentForDiscount(studentId),
      loadDiscountSettings(),
      resolveInput(input, now),
    ]);

    const contractPrice = student.contractPrice.toNumber();
    const discountTotal = student.discountTotal.toNumber();
    const basePrice = contractPrice + discountTotal;
    const active = student.discounts;

    if (active.length > 0 && !settings.allowStacking) {
      throw AppError.unprocessable('Sozlamada bir vaqtda bitta chegirma berish belgilangan — avval mavjudini bekor qiling');
    }
    if (active.length > 0 && !resolved.stackable) {
      throw AppError.unprocessable(`«${resolved.label}» boshqa chegirmalar bilan birga qo‘llanmaydi`);
    }
    if (resolved.ruleId && active.some((item) => item.ruleId === resolved.ruleId)) {
      throw AppError.conflict('Bu chegirma allaqachon berilgan');
    }

    const amount = amountFor(basePrice, resolved.valueType, resolved.value);
    if (amount <= 0) throw AppError.unprocessable('Chegirma summasi noldan katta bo‘lsin');

    const allowed = Math.round((basePrice * settings.maxPercent) / 100);
    if (discountTotal + amount > allowed) {
      throw AppError.unprocessable(
        `Umumiy chegirma ${settings.maxPercent}% dan oshmasin — bu o‘quvchiga yana ${moneyUz(Math.max(allowed - discountTotal, 0))} berish mumkin`,
      );
    }
    if (amount > contractPrice) {
      throw AppError.unprocessable('Chegirma shartnoma summasidan katta');
    }

    return { resolved, amount, basePrice, newContractPrice: contractPrice - amount };
  },

  async grant(actor: AuthUser, studentId: string, input: GrantDiscountInput, client: ClientInfo): Promise<StudentDiscountSummary> {
    const { resolved, amount, newContractPrice } = await this.evaluate(studentId, input);
    const student = await loadStudentForDiscount(studentId);
    const paid = student.debt?.paidAmount.toNumber() ?? 0;

    await prisma.$transaction(async (tx) => {
      const created = await tx.studentDiscount.create({
        data: {
          studentId,
          ruleId: resolved.ruleId,
          promoCodeId: resolved.promoCodeId,
          label: resolved.label,
          type: resolved.type,
          valueType: resolved.valueType,
          value: resolved.value,
          amount,
          note: input.note?.trim() || null,
          grantedById: actor.id,
        },
        select: { id: true },
      });
      await tx.student.update({
        where: { id: studentId },
        data: { contractPrice: newContractPrice, discountTotal: { increment: amount } },
      });
      await syncDebt(tx, studentId, newContractPrice, paid);
      if (resolved.promoCodeId) {
        await tx.promoCode.update({ where: { id: resolved.promoCodeId }, data: { usedCount: { increment: 1 } } });
      }
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'discount.granted',
        entityType: 'student',
        entityId: studentId,
        metadata: {
          discountId: created.id,
          label: resolved.label,
          type: resolved.type,
          amount,
          contractPriceTo: newContractPrice,
        },
        ...client,
      });
    });

    return this.forStudent(studentId);
  },

  /** Bekor qilish — yozuv qoladi, summa shartnomaga qaytariladi */
  async revoke(actor: AuthUser, discountId: string, reason: string, client: ClientInfo): Promise<StudentDiscountSummary> {
    const discount = await prisma.studentDiscount.findUnique({
      where: { id: discountId },
      select: { id: true, studentId: true, amount: true, label: true, revokedAt: true, promoCodeId: true },
    });
    if (!discount) throw AppError.notFound('Chegirma topilmadi');
    if (discount.revokedAt) throw AppError.conflict('Bu chegirma allaqachon bekor qilingan');

    const student = await loadStudentForDiscount(discount.studentId);
    const amount = discount.amount.toNumber();
    const newContractPrice = student.contractPrice.toNumber() + amount;
    const paid = student.debt?.paidAmount.toNumber() ?? 0;

    await prisma.$transaction(async (tx) => {
      await tx.studentDiscount.update({
        where: { id: discountId },
        data: { revokedAt: new Date(), revokedById: actor.id, revokeReason: reason },
      });
      await tx.student.update({
        where: { id: discount.studentId },
        data: { contractPrice: newContractPrice, discountTotal: { decrement: amount } },
      });
      await syncDebt(tx, discount.studentId, newContractPrice, paid);
      if (discount.promoCodeId) {
        // Kod qayta ishlatilishi mumkin bo'lsin — limit haqiqiy qo'llanishlarni hisoblaydi
        await tx.promoCode.updateMany({ where: { id: discount.promoCodeId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
      }
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'discount.revoked',
        entityType: 'student',
        entityId: discount.studentId,
        metadata: { discountId, label: discount.label, amount, reason, contractPriceTo: newContractPrice },
        ...client,
      });
    });

    return this.forStudent(discount.studentId);
  },

  /**
   * Referal bonusi uchun ichki yo'l: tranzaksiya ichida chegirma yozadi.
   * `grant()` dan farqi — tashqi tranzaksiyada ishlaydi va cheklovlar allaqachon tekshirilgan.
   */
  async grantInTransaction(
    tx: Prisma.TransactionClient,
    params: { studentId: string; ruleId: string | null; label: string; type: DiscountType; valueType: DiscountValueType; value: number; amount: number; note: string; grantedById: string },
  ): Promise<string> {
    const student = await tx.student.findUniqueOrThrow({
      where: { id: params.studentId },
      select: { contractPrice: true, debt: { select: { paidAmount: true } } },
    });
    const newContractPrice = student.contractPrice.toNumber() - params.amount;
    const created = await tx.studentDiscount.create({
      data: {
        studentId: params.studentId,
        ruleId: params.ruleId,
        label: params.label,
        type: params.type,
        valueType: params.valueType,
        value: params.value,
        amount: params.amount,
        note: params.note,
        grantedById: params.grantedById,
      },
      select: { id: true },
    });
    await tx.student.update({
      where: { id: params.studentId },
      data: { contractPrice: newContractPrice, discountTotal: { increment: params.amount } },
    });
    await syncDebt(tx, params.studentId, newContractPrice, student.debt?.paidAmount.toNumber() ?? 0);
    return created.id;
  },
};
