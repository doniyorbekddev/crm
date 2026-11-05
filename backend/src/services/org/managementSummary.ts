import { groupUz } from '../../utils/money.js';

/**
 * CEO uchun boshqaruv xulosasi (ORG roadmap §7 "AI insights"): Tashkilot paneli raqamlaridan qoida bo'yicha yig'iladi.
 * Har fikr manba ko'rsatkichi (nomi va qiymati) va ochiladigan sahifa bilan — tekshirsa bo'ladi. Hech qanday amal
 * bajarilmaydi (ishdan bo'shatish, maosh, ruxsat, tashqi xabar — yo'q), faqat ko'rib chiqish uchun ko'rsatma.
 */

export interface ManagementInsight {
  key: string;
  tone: 'negative' | 'neutral' | 'positive';
  area: string;
  text: string;
  /** Fikr qaysi raqamga tayangan */
  metric: { label: string; value: string };
  link: string;
}

export interface SummaryInput {
  attendance: { late: number; absent: number; lateNames: string[] } | null;
  team: { onProbation: number; vacancies: number; withoutAccount: number } | null;
  tasks: { overdue: number; review: number; doneThisMonth: number } | null;
  kpi: { month: string; below: Array<{ name: string; achievement: number }> } | null;
  academic: { attendanceRate: number; droppedStudents: number; newStudents: number } | null;
  payments: { revenue: number; dueDebt: number; dueDebtors: number } | null;
  expenses: { overLimit: Array<{ name: string; spent: number; limit: number }> } | null;
  complaints: { critical: number; overdue: number; escalated: number } | null;
  marketing: { roi: number | null; costPerLead: number | null } | null;
  approvals: { expenses: number; discounts: number; reviews: number; promotions: number; candidates: number } | null;
  /** Oldingi davrga nisbatan o'zgarish (Direktor paneli): summalar — %, foizlar — punkt */
  changes: { revenue: number | null; conversionRate: number | null } | null;
}

const money = (value: number) => `${groupUz(Math.round(value))} so‘m`;
const ATTENDANCE_NORM = 85;
const MAX_INSIGHTS = 8;
const ORDER: Record<ManagementInsight['tone'], number> = { negative: 0, neutral: 1, positive: 2 };

export function buildManagementSummary(input: SummaryInput): ManagementInsight[] {
  const out: ManagementInsight[] = [];
  const push = (item: ManagementInsight) => out.push(item);

  if (input.complaints && input.complaints.critical > 0) {
    push({ key: 'complaints_critical', tone: 'negative', area: 'Murojaatlar', text: `${input.complaints.critical} ta jiddiy murojaat ochiq — darhol ko‘rib chiqing`, metric: { label: 'Jiddiy murojaatlar', value: String(input.complaints.critical) }, link: '/complaints' });
  } else if (input.complaints && input.complaints.overdue > 0) {
    push({ key: 'complaints_overdue', tone: 'negative', area: 'Murojaatlar', text: `${input.complaints.overdue} ta murojaatning javob muddati o‘tgan`, metric: { label: 'Muddati o‘tgan murojaatlar', value: String(input.complaints.overdue) }, link: '/complaints' });
  }
  if (input.tasks && input.tasks.overdue > 0) {
    push({ key: 'tasks_overdue', tone: 'negative', area: 'Vazifalar', text: `${input.tasks.overdue} ta vazifa muddati o‘tgan — mas’ullar bilan gaplashing`, metric: { label: 'Muddati o‘tgan vazifalar', value: String(input.tasks.overdue) }, link: '/tasks?scope=all' });
  }
  if (input.attendance && (input.attendance.late > 0 || input.attendance.absent > 0)) {
    const names = input.attendance.lateNames.slice(0, 3).join(', ');
    push({
      key: 'attendance_exceptions',
      tone: 'negative',
      area: 'Davomat',
      text: `Bugun ${input.attendance.late} ta kechikish, ${input.attendance.absent} ta kelmagan${names ? ` (${names})` : ''}`,
      metric: { label: 'Kechikkan / kelmagan', value: `${input.attendance.late} / ${input.attendance.absent}` },
      link: '/staff-attendance',
    });
  }
  if (input.kpi && input.kpi.below.length > 0) {
    const names = input.kpi.below.slice(0, 3).map((item) => `${item.name} ${item.achievement}%`).join(', ');
    push({ key: 'kpi_below', tone: 'negative', area: 'KPI', text: `${input.kpi.month}: rejadan past natija — ${names}`, metric: { label: 'Rejadan past xodimlar', value: String(input.kpi.below.length) }, link: '/payroll' });
  }
  if (input.expenses && input.expenses.overLimit.length > 0) {
    const first = input.expenses.overLimit[0]!;
    push({ key: 'expense_limit', tone: 'negative', area: 'Xarajatlar', text: `${input.expenses.overLimit.length} ta bo‘lim oylik limitdan oshdi (${first.name}: ${money(first.spent)} / ${money(first.limit)})`, metric: { label: 'Limitdan oshgan bo‘limlar', value: String(input.expenses.overLimit.length) }, link: '/expenses' });
  }
  if (input.payments && input.payments.dueDebt > 0) {
    push({ key: 'due_debt', tone: input.payments.dueDebtors > 0 ? 'negative' : 'neutral', area: 'To‘lovlar', text: `${input.payments.dueDebtors} ta o‘quvchining muddati kelgan qarzi bor`, metric: { label: 'Muddati kelgan qarz', value: money(input.payments.dueDebt) }, link: '/debts' });
  }
  if (input.academic && input.academic.attendanceRate > 0 && input.academic.attendanceRate < ATTENDANCE_NORM) {
    push({ key: 'student_attendance', tone: 'negative', area: 'Ta’lim', text: `O‘quvchilar davomati ${input.academic.attendanceRate}% — me’yordan (${ATTENDANCE_NORM}%) past`, metric: { label: 'Davomat', value: `${input.academic.attendanceRate}%` }, link: '/attendance' });
  }
  if (input.academic && input.academic.droppedStudents > 0) {
    push({ key: 'dropped', tone: 'negative', area: 'Ta’lim', text: `Shu oy ${input.academic.droppedStudents} ta o‘quvchi ketdi — sabablarini tekshiring`, metric: { label: 'Ketgan o‘quvchilar', value: String(input.academic.droppedStudents) }, link: '/students?status=DROPPED' });
  }
  if (input.changes?.revenue !== null && input.changes?.revenue !== undefined && Math.abs(input.changes.revenue) >= 10) {
    const up = input.changes.revenue > 0;
    push({ key: up ? 'revenue_up' : 'revenue_down', tone: up ? 'positive' : 'negative', area: 'Moliya', text: `Tushum oldingi davrga nisbatan ${Math.abs(input.changes.revenue)}% ${up ? 'oshdi' : 'kamaydi'}`, metric: { label: 'Shu oy tushum', value: money(input.payments?.revenue ?? 0) }, link: '/executive' });
  }
  if (input.changes?.conversionRate !== null && input.changes?.conversionRate !== undefined && Math.abs(input.changes.conversionRate) >= 5) {
    const up = input.changes.conversionRate > 0;
    push({ key: up ? 'conversion_up' : 'conversion_down', tone: up ? 'positive' : 'negative', area: 'Sotuv', text: `Sotuv konversiyasi ${Math.abs(input.changes.conversionRate)} punktga ${up ? 'oshdi' : 'tushdi'}`, metric: { label: 'Konversiya o‘zgarishi', value: `${input.changes.conversionRate > 0 ? '+' : ''}${input.changes.conversionRate} p.` }, link: '/executive' });
  }
  if (input.marketing && input.marketing.roi !== null && input.marketing.roi < 0) {
    push({ key: 'marketing_roi', tone: 'negative', area: 'Marketing', text: `Reklama hozircha o‘zini qoplamayapti (ROI ${input.marketing.roi}%)`, metric: { label: 'Marketing ROI', value: `${input.marketing.roi}%` }, link: '/analytics' });
  }
  if (input.approvals) {
    const waiting = input.approvals.expenses + input.approvals.discounts + input.approvals.reviews + input.approvals.promotions + input.approvals.candidates;
    if (waiting > 0) push({ key: 'approvals', tone: 'neutral', area: 'Tasdiqlar', text: `${waiting} ta qaroringizni kutmoqda (xarajat, chegirma, baholash, ko‘tarilish, nomzod)`, metric: { label: 'Qaror kutayotganlar', value: String(waiting) }, link: '/my-work' });
  }
  if (input.team && input.team.onProbation > 0) {
    push({ key: 'probation', tone: 'neutral', area: 'Jamoa', text: `${input.team.onProbation} ta xodim sinov muddatida — natijasiga qarab qaror qabul qiling`, metric: { label: 'Sinovdagilar', value: String(input.team.onProbation) }, link: '/org-structure' });
  }
  if (input.team && input.team.vacancies > 0) {
    push({ key: 'vacancies', tone: 'neutral', area: 'Jamoa', text: `${input.team.vacancies} ta lavozim bo‘sh`, metric: { label: 'Vakant lavozimlar', value: String(input.team.vacancies) }, link: '/org-structure' });
  }
  if (input.tasks && input.tasks.overdue === 0 && input.tasks.doneThisMonth > 0) {
    push({ key: 'tasks_good', tone: 'positive', area: 'Vazifalar', text: `Muddati o‘tgan vazifa yo‘q, shu oy ${input.tasks.doneThisMonth} ta bajarildi`, metric: { label: 'Shu oy bajarilgan', value: String(input.tasks.doneThisMonth) }, link: '/tasks' });
  }
  if (input.academic && input.academic.newStudents > 0) {
    push({ key: 'new_students', tone: 'positive', area: 'Sotuv', text: `Shu oy ${input.academic.newStudents} ta yangi o‘quvchi qo‘shildi`, metric: { label: 'Yangi o‘quvchilar', value: String(input.academic.newStudents) }, link: '/students' });
  }

  return out.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]).slice(0, MAX_INSIGHTS);
}
