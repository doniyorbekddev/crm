import { prisma } from '../../config/database.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PERMISSIONS } from '../../config/permissions.js';
import type { PermissionKey } from '../../config/permissions.js';
import type { AuthUser } from '../../types/auth.js';
import { startOfBusinessDay, startOfBusinessMonth } from '../../utils/dates.js';
import { moneyUz } from '../../utils/money.js';
import { analyticsService } from '../analytics.service.js';
import { branchFilter, getBranchAccess } from '../branchAccess.js';
import type { BranchAccess } from '../branchAccess.js';
import { dashboardService } from '../dashboard.service.js';
import { debtService } from '../debt.service.js';
import { executiveService } from '../executive.service.js';
import { feedbackService } from '../feedback.service.js';

/**
 * AI yordamchisining **xavfsiz so'rovlar to'plami** (tool registry).
 *
 * Tamoyillar:
 *  - **SQL yo'q:** til modeli hech qachon baza bilan to'g'ridan-to'g'ri gaplashmaydi. U faqat shu
 *    ro'yxatdan bitta tool tanlaydi; so'rovni tool o'zi, mavjud servislar orqali bajaradi.
 *  - **Ruxsat har doim tekshiriladi:** har bir tool o'zi talab qiladigan ruxsatni e'lon qiladi va
 *    bajarilishdan oldin tekshiriladi. Ruxsati yo'q savol javobsiz qoladi — "ma'lumot yo'q" deb emas,
 *    "ruxsat yo'q" deb aytiladi.
 *  - **Filial doirasi:** tool ichidagi so'rovlar `branchAccess` orqali o'tadi, shuning uchun
 *    xodim boshqa filial raqamlarini savol orqali ham ko'ra olmaydi.
 *  - **Shaxsiy ma'lumot minimal:** javoblarda ism faqat kerak bo'lganda (masalan xavf ostidagi
 *    o'quvchilar ro'yxati) va faqat tegishli ruxsat bilan ko'rsatiladi; telefon, manzil, pasport
 *    kabi maydonlar hech qachon qaytarilmaydi.
 */

export interface AiToolContext {
  actor: AuthUser;
  permissions: ReadonlySet<string>;
  branch: BranchAccess;
  now: Date;
}

export interface AiToolResult {
  /** Foydalanuvchiga ko'rsatiladigan qisqa javob (o'zbekcha, raqamlar bilan) */
  answer: string;
  /** Qo'shimcha satrlar: ro'yxat yoki tafsilot */
  details?: string[];
  /** Javob qaysi sahifada to'liq ko'rinadi */
  link?: string;
}

export interface AiTool {
  key: string;
  /** Nima haqida javob beradi — takliflar ro'yxatida ham ishlatiladi */
  title: string;
  /** Foydalanuvchi shunday so'rashi mumkin */
  samples: readonly string[];
  /** Savolni tanib olish uchun kalit so'zlar (kichik harflarda, o'zak shaklida) */
  keywords: readonly string[];
  permission: PermissionKey;
  run: (context: AiToolContext) => Promise<AiToolResult>;
}

const DAY_MS = 86_400_000;

/** Foizni ishorasi bilan yozadi: "+12%" */
function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value}%`;
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function monthQuery(now: Date): { year: number; month: number } {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export const AI_TOOLS: readonly AiTool[] = [
  {
    key: 'revenue_today',
    title: 'Bugungi tushum',
    samples: ['Bugun qancha pul tushdi?'],
    keywords: ['bugun', 'tushum', 'pul', 'tushdi', 'kassa'],
    permission: PERMISSIONS.FINANCE_VIEW,
    async run({ now }) {
      const summary = await executiveService.summary(monthQuery(now));
      const today = summary.today;
      return {
        answer: `Bugun ${moneyUz(today.payments)} tushum bo'ldi, ${moneyUz(today.expenses)} xarajat qilindi — sof ${moneyUz(today.netRevenue)}.`,
        details: [
          `Yangi lead: ${today.newLeads} ta`,
          `Yangi o'quvchi: ${today.newStudents} ta`,
          `Bugungi darslar: ${today.lessons} ta (${today.markedLessons} tasi belgilangan)`,
        ],
        link: '/executive',
      };
    },
  },
  {
    key: 'revenue_month',
    title: 'Oylik tushum va foyda',
    samples: ['Bu oy qancha daromad qildik?', 'Bu oy foyda qancha?'],
    keywords: ['oy', 'daromad', 'foyda', 'tushum', 'revenue', 'profit'],
    permission: PERMISSIONS.FINANCE_VIEW,
    async run({ now }) {
      const summary = await executiveService.summary(monthQuery(now));
      const { month, changes } = summary;
      return {
        answer: `${month.label}: tushum ${moneyUz(month.revenue)}, xarajat ${moneyUz(month.expense)}, sof foyda ${moneyUz(month.netProfit)}.`,
        details: [
          changes.revenue === null
            ? 'O\'tgan davr bilan solishtirish uchun ma\'lumot yetarli emas'
            : `O'tgan davrga nisbatan tushum ${signed(changes.revenue)}`,
          `Marja: ${month.margin}%`,
          `Qarzdorlik: ${moneyUz(month.totalDebt)}`,
        ],
        link: '/executive',
      };
    },
  },
  {
    key: 'period_comparison',
    title: 'Bu oy o‘tgan oyga nisbatan',
    samples: ['Bu oy o‘tgan oyga qaraganda qanday?'],
    keywords: ['solishtir', 'qaraganda', 'nisbatan', 'o\'tgan oy', 'otgan oy', 'taqqosla'],
    permission: PERMISSIONS.ANALYTICS_VIEW,
    async run({ now }) {
      const summary = await executiveService.summary(monthQuery(now));
      const { month, previous, changes } = summary;
      const rows: Array<[string, number, number]> = [
        ['Tushum', month.revenue, previous.revenue],
        ['Xarajat', month.expense, previous.expense],
        ['Sof foyda', month.netProfit, previous.netProfit],
      ];
      const details = rows.map(([label, current, before]) => {
        const change = percentChange(current, before);
        return `${label}: ${moneyUz(current)} (oldingi davr ${moneyUz(before)}${change === null ? '' : `, ${signed(change)}`})`;
      });
      const revenueChange = changes.revenue;
      return {
        answer:
          revenueChange === null
            ? `${month.label} ko'rsatkichlari tayyor, lekin oldingi davr bilan solishtirish uchun ma'lumot yetarli emas.`
            : `${month.label}da tushum oldingi davrga nisbatan ${signed(revenueChange)} o'zgargan.`,
        details,
        link: '/executive',
      };
    },
  },
  {
    key: 'debt_summary',
    title: 'Qarzdorlik',
    samples: ['Qancha qarzdor bor?', 'Qarzdorlik qancha?'],
    keywords: ['qarz', 'qarzdor', 'to\'lamagan', 'tolamagan', 'debt'],
    permission: PERMISSIONS.DEBT_VIEW,
    async run() {
      const summary = await debtService.summary({ page: 1, limit: 1 } as never);
      return {
        answer: `${summary.students} o'quvchida jami ${moneyUz(summary.totalRemaining)} qarz bor.`,
        details: [
          `Muddati o'tgan: ${summary.overdue.students} o'quvchi, ${moneyUz(summary.overdue.amount)}`,
          `Yaqin 7 kunda to'lanishi kerak: ${moneyUz(summary.upcoming.amount)}`,
          `Shartnomalar bo'yicha to'langan: ${moneyUz(summary.totalPaid)}`,
        ],
        link: '/debts',
      };
    },
  },
  {
    key: 'top_courses_revenue',
    title: 'Eng daromadli kurslar',
    samples: ['Qaysi kurs eng ko‘p daromad keltiryapti?'],
    keywords: ['kurs', 'daromadli', 'ko\'p daromad', 'kop daromad', 'foydali kurs'],
    permission: PERMISSIONS.ANALYTICS_VIEW,
    async run() {
      const result = await analyticsService.profitability({ dimension: 'course' } as never);
      const top = [...result.rows].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
      if (top.length === 0) return { answer: 'Tanlangan davrda kurslar bo\'yicha daromad yozuvi yo\'q.', link: '/analytics' };
      const best = top[0]!;
      return {
        answer: `Eng ko'p daromad "${best.name}" kursidan: ${moneyUz(best.revenue)} (hissa ${moneyUz(best.contribution)}).`,
        details: top.map((row, index) => `${index + 1}. ${row.name} — ${moneyUz(row.revenue)}, hissa ${moneyUz(row.contribution)}`),
        link: '/analytics',
      };
    },
  },
  {
    key: 'at_risk_students',
    title: 'Ketib qolish xavfi',
    samples: ['Qaysi o‘quvchilar ketib qolish xavfida?'],
    keywords: ['xavf', 'ketib qol', 'yo\'qotish', 'risk', 'tashlab ket', 'dropout'],
    permission: PERMISSIONS.STUDENT_VIEW,
    async run({ branch }) {
      const where: Prisma.StudentWhereInput = {
        deletedAt: null,
        status: { not: 'DROPPED' },
        riskLevel: { in: ['AT_RISK', 'CRITICAL'] },
        ...branchFilter(branch),
      };
      const [count, students] = await Promise.all([
        prisma.student.count({ where }),
        prisma.student.findMany({
          where,
          select: { id: true, firstName: true, lastName: true, healthScore: true, riskLevel: true },
          orderBy: { healthScore: 'asc' },
          take: 5,
        }),
      ]);
      if (count === 0) return { answer: 'Hozircha yuqori xavfdagi o\'quvchi yo\'q.', link: '/students' };
      return {
        answer: `${count} o'quvchi ketib qolish xavfida (xavf ostida yoki kritik daraja).`,
        details: students.map((student) => `${student.firstName} ${student.lastName} — ball ${student.healthScore ?? '—'}`),
        link: '/students',
      };
    },
  },
  {
    key: 'manager_conversion',
    title: 'Managerlar natijasi',
    samples: ['Qaysi manager eng ko‘p leadni studentga aylantirdi?'],
    keywords: ['manager', 'aylantir', 'konversiya', 'sotuvchi', 'lead'],
    permission: PERMISSIONS.REPORT_VIEW,
    async run() {
      const managers = await dashboardService.managers({ period: 'month' } as never);
      const ranked = [...managers].sort((a, b) => b.won - a.won);
      if (ranked.length === 0 || ranked[0]!.won === 0) {
        return { answer: 'Bu oyda hali birorta lead o\'quvchiga aylantirilmagan.', link: '/dashboard' };
      }
      const best = ranked[0]!;
      return {
        answer: `Bu oyda eng ko'p ${best.firstName} ${best.lastName} aylantirgan: ${best.won} ta (konversiya ${best.conversionRate}%).`,
        details: ranked
          .slice(0, 5)
          .map((row, index) => `${index + 1}. ${row.firstName} ${row.lastName} — ${row.won}/${row.leads} ta, ${moneyUz(row.revenue)}`),
        link: '/dashboard',
      };
    },
  },
  {
    key: 'marketing_channels',
    title: 'Marketing kanallari',
    samples: ['Marketing qaysi kanalda yaxshi ishlayapti?'],
    keywords: ['marketing', 'kanal', 'manba', 'reklama', 'roi', 'instagram', 'telegram'],
    permission: PERMISSIONS.ANALYTICS_VIEW,
    async run() {
      const result = await analyticsService.sources({} as never);
      const withLeads = result.rows.filter((row) => row.leads > 0);
      if (withLeads.length === 0) return { answer: 'Tanlangan davrda manbalar bo\'yicha lead yo\'q.', link: '/analytics' };
      const best = [...withLeads].sort((a, b) => b.conversion - a.conversion)[0]!;
      return {
        answer: `Eng yaxshi konversiya "${best.name}" kanalida: ${best.conversion}% (${best.won}/${best.leads} ta).`,
        details: withLeads
          .slice(0, 5)
          .map((row) => `${row.name} — ${row.leads} lead, ${row.conversion}% konversiya, ${moneyUz(row.revenue)} tushum${row.roi === null ? '' : `, ROI ${row.roi}%`}`),
        link: '/analytics',
      };
    },
  },
  {
    key: 'students_count',
    title: 'O‘quvchilar soni',
    samples: ['Nechta faol o‘quvchi bor?', 'Bu oy nechta yangi o‘quvchi qo‘shildi?'],
    keywords: ['nechta o\'quvchi', 'nechta oquvchi', 'faol o\'quvchi', 'yangi o\'quvchi', 'o\'quvchilar soni'],
    permission: PERMISSIONS.STUDENT_VIEW,
    async run({ branch, now }) {
      const scope = branchFilter(branch);
      const monthStart = startOfBusinessMonth(now);
      const [active, newThisMonth, dropped] = await Promise.all([
        prisma.student.count({ where: { deletedAt: null, status: 'ACTIVE', ...scope } }),
        prisma.student.count({ where: { deletedAt: null, createdAt: { gte: monthStart }, ...scope } }),
        prisma.student.count({ where: { deletedAt: null, status: 'DROPPED', ...scope } }),
      ]);
      return {
        answer: `Hozir ${active} ta faol o'quvchi bor. Bu oyda ${newThisMonth} ta yangi o'quvchi qo'shildi.`,
        details: [`O'qishni tashlaganlar (jami): ${dropped} ta`],
        link: '/students',
      };
    },
  },
  {
    key: 'attendance_summary',
    title: 'Davomat',
    samples: ['Davomat qanday?', 'Bu oy davomat necha foiz?'],
    keywords: ['davomat', 'kelmadi', 'qatnash', 'attendance'],
    permission: PERMISSIONS.ATTENDANCE_VIEW,
    async run({ now }) {
      const summary = await executiveService.summary(monthQuery(now));
      return {
        answer: `${summary.month.label}da davomat ${summary.kpi.attendanceRate}%.`,
        details: [`Bugun ${summary.today.absentStudents} o'quvchi darsga kelmadi`],
        link: '/attendance',
      };
    },
  },
  {
    key: 'low_stock',
    title: 'Omborda kam qolganlar',
    samples: ['Omborda nima kam qoldi?'],
    keywords: ['ombor', 'mahsulot', 'qoldiq', 'kam qoldi', 'tugadi', 'kitob qoldi'],
    permission: PERMISSIONS.INVENTORY_VIEW,
    async run({ branch }) {
      const products = await prisma.product.findMany({
        where: { isActive: true, ...branchFilter(branch) },
        select: { name: true, quantity: true, minQuantity: true, unit: true },
        orderBy: { quantity: 'asc' },
      });
      const low = products.filter((item) => item.minQuantity > 0 && item.quantity <= item.minQuantity);
      if (low.length === 0) return { answer: 'Omborda kam qolgan mahsulot yo\'q.', link: '/inventory' };
      return {
        answer: `${low.length} ta mahsulot kam qoldi.`,
        details: low.slice(0, 8).map((item) => `${item.name} — ${item.quantity} ${item.unit} (chegara ${item.minQuantity})`),
        link: '/inventory',
      };
    },
  },
  {
    key: 'nps_summary',
    title: 'O‘quvchilar fikri va NPS',
    samples: ['NPS qanday?', 'O‘quvchilar bahosi qanday?'],
    keywords: ['nps', 'fikr', 'baho', 'qoniqish', 'feedback'],
    permission: PERMISSIONS.FEEDBACK_VIEW,
    async run() {
      const stats = await feedbackService.stats({});
      if (stats.total === 0) return { answer: 'Hali fikr qoldirilmagan.', link: '/feedback' };
      return {
        answer:
          stats.nps === null
            ? `${stats.total} ta fikr bor, lekin NPS uchun javob yetarli emas.`
            : `NPS ${stats.nps} (${stats.promoters} tarafdor, ${stats.detractors} tanqidchi).`,
        details: [
          `O'qituvchi bahosi: ${stats.teacherAverage === null ? '—' : `${stats.teacherAverage}/5`}`,
          `Markaz bahosi: ${stats.academyAverage === null ? '—' : `${stats.academyAverage}/5`}`,
          `Ishlanmagan salbiy fikr: ${stats.openNegative} ta`,
        ],
        link: '/feedback',
      };
    },
  },
  {
    key: 'today_followups',
    title: 'Bugungi vazifalar',
    samples: ['Bugun nima qilishim kerak?', 'Bugungi follow-uplar'],
    keywords: ['vazifa', 'follow', 'bugun nima', 'qo\'ng\'iroq qilish', 'rejalashtirilgan'],
    permission: PERMISSIONS.FOLLOWUP_VIEW,
    async run({ actor }) {
      const items = await dashboardService.followUps(actor);
      const overdue = items.filter((item) => item.overdue);
      return {
        answer: `Bugun ${items.length} ta rejalashtirilgan aloqa bor${overdue.length > 0 ? `, shundan ${overdue.length} tasi kechikkan` : ''}.`,
        details: items
          .slice(0, 5)
          .map((item) => `${item.lead.firstName} ${item.lead.lastName ?? ''} — ${item.title}`.replace(/\s+/g, ' ').trim()),
        link: '/follow-ups',
      };
    },
  },
  {
    key: 'new_leads',
    title: 'Yangi leadlar',
    samples: ['Bu hafta nechta lead keldi?'],
    keywords: ['lead', 'nechta lead', 'yangi mijoz', 'murojaat'],
    permission: PERMISSIONS.LEAD_VIEW,
    async run({ branch, now }) {
      const scope = branchFilter(branch);
      const weekStart = new Date(startOfBusinessDay(now).getTime() - 6 * DAY_MS);
      const monthStart = startOfBusinessMonth(now);
      const [week, month, won] = await Promise.all([
        prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: weekStart }, ...scope } }),
        prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: monthStart }, ...scope } }),
        prisma.lead.count({ where: { deletedAt: null, status: 'WON', convertedAt: { gte: monthStart }, ...scope } }),
      ]);
      return {
        answer: `So'nggi 7 kunda ${week} ta lead keldi, bu oyda jami ${month} ta.`,
        details: [`Bu oyda ${won} tasi o'quvchiga aylantirilgan`],
        link: '/leads',
      };
    },
  },
];

export function findTool(key: string): AiTool | undefined {
  return AI_TOOLS.find((tool) => tool.key === key);
}

export async function buildContext(actor: AuthUser, permissions: ReadonlySet<string>, now = new Date()): Promise<AiToolContext> {
  return { actor, permissions, branch: await getBranchAccess(actor), now };
}
