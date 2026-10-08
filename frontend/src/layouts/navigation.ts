import {
  Megaphone,
  Landmark,
  Inbox,
  ListTodo,
  LineChart,
  Presentation,
  BadgePercent,
  Workflow,
  Sparkles,
  Building2,
  Package,
  MessageSquareHeart,
  Gift,
  HelpCircle,
  DoorOpen,
  Activity,
  BarChart3,
  Bell,
  FileSpreadsheet,
  History,
  BookOpen,
  Coins,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  Crosshair,
  FileCheck,
  Gauge,
  GraduationCap,
  IdCard,
  HandCoins,
  Layers,
  ScrollText,
  ShieldCheck,
  Siren,
  Target,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserCog,
  Wallet,
  UserRound,
  Users,
  UsersRound,
  Wallet2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PERMISSIONS } from '@/utils/permissionKeys';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Ko‘rsatish uchun kerakli permission (ro‘yxat — istalgan biri; yo‘q bo‘lsa — hamma uchun) */
  permission?: string | readonly string[];
}

export interface NavSection {
  /** Barqaror kalit — yig'ilgan bo'limlar shu bo'yicha saqlanadi (nom o'zgarsa ham) */
  id: string;
  title: string;
  items: NavItem[];
}

/**
 * Sidebar menyusi — mantiqiy guruhlar (dizayn PHASE 2). Faqat mavjud marshrutlar: yo'llar, nomlar va ruxsatlar
 * o'zgarmagan, faqat guruhlash. Yangi modul tayyor bo'lganda tegishli guruhga qo'shiladi.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'overview',
    title: 'Umumiy',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: BarChart3, permission: PERMISSIONS.DASHBOARD_VIEW },
      { to: '/executive', label: 'Direktor paneli', icon: Gauge, permission: PERMISSIONS.ANALYTICS_VIEW },
      { to: '/alerts', label: 'Ogohlantirishlar', icon: Siren, permission: PERMISSIONS.ALERT_VIEW },
      { to: '/my-work', label: 'Ishlarim', icon: Inbox },
      { to: '/tasks', label: 'Vazifalar', icon: ListTodo },
    ],
  },
  {
    id: 'sales',
    title: 'Sotuv',
    items: [
      { to: '/leads', label: 'Leadlar', icon: Target, permission: PERMISSIONS.LEAD_VIEW },
      { to: '/follow-ups', label: 'Follow-up', icon: CalendarClock, permission: PERMISSIONS.FOLLOWUP_VIEW },
      { to: '/targets', label: 'Sotuv rejalari', icon: Crosshair, permission: PERMISSIONS.TARGET_VIEW },
      { to: '/referrals', label: 'Takliflar', icon: Gift, permission: PERMISSIONS.REFERRAL_VIEW },
      { to: '/discounts', label: 'Chegirmalar', icon: BadgePercent, permission: PERMISSIONS.DISCOUNT_VIEW },
    ],
  },
  {
    id: 'academic',
    title: 'O‘quv jarayoni',
    items: [
      { to: '/teaching', label: 'O‘qituvchi markazi', icon: Presentation, permission: PERMISSIONS.ATTENDANCE_MARK },
      { to: '/students', label: 'O‘quvchilar', icon: GraduationCap, permission: PERMISSIONS.STUDENT_VIEW },
      { to: '/groups', label: 'Guruhlar', icon: Layers, permission: PERMISSIONS.GROUP_VIEW },
      { to: '/courses', label: 'Kurslar', icon: BookOpen, permission: PERMISSIONS.COURSE_VIEW },
      { to: '/rooms', label: 'Xonalar', icon: DoorOpen, permission: PERMISSIONS.GROUP_VIEW },
      { to: '/attendance', label: 'Davomat', icon: CalendarCheck, permission: PERMISSIONS.ATTENDANCE_VIEW },
      { to: '/homework', label: 'Uy vazifasi', icon: ClipboardList, permission: PERMISSIONS.HOMEWORK_VIEW },
      { to: '/exams', label: 'Imtihonlar', icon: FileCheck, permission: PERMISSIONS.EXAM_VIEW },
      { to: '/questions', label: 'Savollar bazasi', icon: HelpCircle, permission: PERMISSIONS.EXAM_VIEW },
      { to: '/gamification', label: 'Reyting', icon: Trophy, permission: PERMISSIONS.GAMIFICATION_VIEW },
    ],
  },
  {
    id: 'finance',
    title: 'Moliya',
    items: [
      { to: '/payments', label: 'To‘lovlar', icon: Wallet, permission: PERMISSIONS.PAYMENT_VIEW },
      { to: '/debts', label: 'Qarzdorlik', icon: HandCoins, permission: PERMISSIONS.DEBT_VIEW },
      { to: '/finance', label: 'Moliya paneli', icon: PiggyBank, permission: PERMISSIONS.FINANCE_VIEW },
      { to: '/incomes', label: 'Tushumlar', icon: TrendingUp, permission: PERMISSIONS.INCOME_VIEW },
      { to: '/expenses', label: 'Xarajatlar', icon: TrendingDown, permission: PERMISSIONS.EXPENSE_VIEW },
      { to: '/salaries', label: 'Maoshlar', icon: Wallet2, permission: PERMISSIONS.SALARY_VIEW },
      { to: '/my-earnings', label: 'Mening daromadim', icon: Coins, permission: PERMISSIONS.COMMISSION_VIEW_OWN },
      { to: '/inventory', label: 'Ombor', icon: Package, permission: PERMISSIONS.INVENTORY_VIEW },
      { to: '/reports', label: 'Hisobotlar', icon: FileSpreadsheet, permission: PERMISSIONS.REPORT_VIEW },
    ],
  },
  {
    id: 'people',
    title: 'Odamlar',
    items: [
      { to: '/teachers', label: 'O‘qituvchilar', icon: UserCog, permission: PERMISSIONS.TEACHER_VIEW },
      { to: '/parents', label: 'Ota-onalar', icon: UsersRound, permission: PERMISSIONS.PARENT_VIEW },
      { to: '/employees', label: 'Xodimlar', icon: IdCard, permission: PERMISSIONS.EMPLOYEE_VIEW },
      { to: '/feedback', label: 'Fikr-mulohaza', icon: MessageSquareHeart, permission: PERMISSIONS.FEEDBACK_VIEW },
    ],
  },
  {
    id: 'analytics',
    title: 'Analitika',
    items: [
      { to: '/analytics', label: 'Analitika', icon: Activity, permission: PERMISSIONS.ANALYTICS_VIEW },
      { to: '/academic-analytics', label: 'Akademik analitika', icon: LineChart, permission: [PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.ATTENDANCE_MARK] },
      { to: '/activity', label: 'Faoliyat', icon: History, permission: PERMISSIONS.ANALYTICS_VIEW },
      { to: '/assistant', label: 'AI yordamchi', icon: Sparkles, permission: [PERMISSIONS.AI_ASSISTANT, PERMISSIONS.AI_ACADEMIC] },
    ],
  },
  {
    id: 'automation',
    title: 'Avtomatlashtirish',
    items: [
      { to: '/automation', label: 'Avtomatlashtirish', icon: Workflow, permission: PERMISSIONS.ALERT_VIEW },
      { to: '/broadcasts', label: 'Ommaviy xabar', icon: Megaphone, permission: PERMISSIONS.BROADCAST_SEND },
      { to: '/notifications', label: 'Bildirishnomalar', icon: Bell },
    ],
  },
  {
    id: 'system',
    title: 'Tizim',
    items: [
      { to: '/users', label: 'Foydalanuvchilar', icon: Users, permission: PERMISSIONS.USER_VIEW },
      { to: '/roles', label: 'Rollar va ruxsatlar', icon: ShieldCheck, permission: PERMISSIONS.ROLE_MANAGE },
      { to: '/branches', label: 'Filiallar', icon: Building2, permission: PERMISSIONS.BRANCH_MANAGE },
      { to: '/settings/academy', label: 'Markaz ma’lumotlari', icon: Landmark, permission: PERMISSIONS.SETTINGS_MANAGE },
      { to: '/audit-logs', label: 'Audit jurnali', icon: ScrollText, permission: PERMISSIONS.AUDIT_VIEW },
      { to: '/status', label: 'Tizim holati', icon: Activity },
      { to: '/profile', label: 'Profil', icon: UserRound },
    ],
  },
];

/** Joriy manzilga mos menyu bandi (eng uzun mos yo'l) va uning bo'limi — breadcrumb va faol bo'lim uchun */
export function findNavEntry(pathname: string): { section: NavSection; item: NavItem } | null {
  let best: { section: NavSection; item: NavItem } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      const matches = pathname === item.to || pathname.startsWith(`${item.to}/`);
      if (matches && (!best || item.to.length > best.item.to.length)) best = { section, item };
    }
  }
  return best;
}
