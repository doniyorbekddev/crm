import {
  Megaphone,
  Landmark,
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
  title: string;
  items: NavItem[];
}

/** Sidebar menyusi. Har bir phase’da tayyor bo‘lgan modullar shu ro‘yxatga qo‘shiladi. */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    title: 'Umumiy',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: BarChart3, permission: PERMISSIONS.DASHBOARD_VIEW },
      { to: '/executive', label: 'Direktor paneli', icon: Gauge, permission: PERMISSIONS.ANALYTICS_VIEW },
      { to: '/analytics', label: 'Analitika', icon: Activity, permission: PERMISSIONS.ANALYTICS_VIEW },
      { to: '/activity', label: 'Faoliyat', icon: History, permission: PERMISSIONS.ANALYTICS_VIEW },
      { to: '/alerts', label: 'Ogohlantirishlar', icon: Siren, permission: PERMISSIONS.ALERT_VIEW },
      { to: '/assistant', label: 'AI yordamchi', icon: Sparkles, permission: [PERMISSIONS.AI_ASSISTANT, PERMISSIONS.AI_ACADEMIC] },
      { to: '/automation', label: 'Avtomatlashtirish', icon: Workflow, permission: PERMISSIONS.ALERT_VIEW },
    ],
  },
  {
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
    title: 'O‘quv jarayoni',
    items: [
      { to: '/teaching', label: 'O‘qituvchi markazi', icon: Presentation, permission: PERMISSIONS.ATTENDANCE_MARK },
      { to: '/tasks', label: 'Ishlarim', icon: ListTodo },
      { to: '/academic-analytics', label: 'Akademik analitika', icon: LineChart, permission: [PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.ATTENDANCE_MARK] },
      { to: '/courses', label: 'Kurslar', icon: BookOpen, permission: PERMISSIONS.COURSE_VIEW },
      { to: '/groups', label: 'Guruhlar', icon: Layers, permission: PERMISSIONS.GROUP_VIEW },
      { to: '/rooms', label: 'Xonalar', icon: DoorOpen, permission: PERMISSIONS.GROUP_VIEW },
      { to: '/students', label: 'O‘quvchilar', icon: GraduationCap, permission: PERMISSIONS.STUDENT_VIEW },
      { to: '/parents', label: 'Ota-onalar', icon: UsersRound, permission: PERMISSIONS.PARENT_VIEW },
      { to: '/attendance', label: 'Davomat', icon: CalendarCheck, permission: PERMISSIONS.ATTENDANCE_VIEW },
      { to: '/homework', label: 'Uy vazifasi', icon: ClipboardList, permission: PERMISSIONS.HOMEWORK_VIEW },
      { to: '/exams', label: 'Imtihonlar', icon: FileCheck, permission: PERMISSIONS.EXAM_VIEW },
      { to: '/questions', label: 'Savollar bazasi', icon: HelpCircle, permission: PERMISSIONS.EXAM_VIEW },
      { to: '/gamification', label: 'Reyting', icon: Trophy, permission: PERMISSIONS.GAMIFICATION_VIEW },
      { to: '/teachers', label: 'O‘qituvchilar', icon: UserCog, permission: PERMISSIONS.TEACHER_VIEW },
      { to: '/feedback', label: 'Fikr-mulohaza', icon: MessageSquareHeart, permission: PERMISSIONS.FEEDBACK_VIEW },
      { to: '/my-earnings', label: 'Mening daromadim', icon: Coins, permission: PERMISSIONS.COMMISSION_VIEW_OWN },
    ],
  },
  {
    title: 'Moliya',
    items: [
      { to: '/payments', label: 'To‘lovlar', icon: Wallet, permission: PERMISSIONS.PAYMENT_VIEW },
      { to: '/debts', label: 'Qarzdorlik', icon: HandCoins, permission: PERMISSIONS.DEBT_VIEW },
      { to: '/finance', label: 'Moliya paneli', icon: PiggyBank, permission: PERMISSIONS.FINANCE_VIEW },
      { to: '/incomes', label: 'Tushumlar', icon: TrendingUp, permission: PERMISSIONS.INCOME_VIEW },
      { to: '/expenses', label: 'Xarajatlar', icon: TrendingDown, permission: PERMISSIONS.EXPENSE_VIEW },
      { to: '/salaries', label: 'Maoshlar', icon: Wallet2, permission: PERMISSIONS.SALARY_VIEW },
      { to: '/inventory', label: 'Ombor', icon: Package, permission: PERMISSIONS.INVENTORY_VIEW },
      { to: '/reports', label: 'Hisobotlar', icon: FileSpreadsheet, permission: PERMISSIONS.REPORT_VIEW },
    ],
  },
  {
    title: 'Boshqaruv',
    items: [
      { to: '/employees', label: 'Xodimlar', icon: IdCard, permission: PERMISSIONS.EMPLOYEE_VIEW },
      { to: '/users', label: 'Foydalanuvchilar', icon: Users, permission: PERMISSIONS.USER_VIEW },
      { to: '/branches', label: 'Filiallar', icon: Building2, permission: PERMISSIONS.BRANCH_MANAGE },
      { to: '/roles', label: 'Rollar va ruxsatlar', icon: ShieldCheck, permission: PERMISSIONS.ROLE_MANAGE },
      { to: '/settings/academy', label: 'Markaz ma’lumotlari', icon: Landmark, permission: PERMISSIONS.SETTINGS_MANAGE },
      { to: '/broadcasts', label: 'Ommaviy xabar', icon: Megaphone, permission: PERMISSIONS.BROADCAST_SEND },
      { to: '/audit-logs', label: 'Audit jurnali', icon: ScrollText, permission: PERMISSIONS.AUDIT_VIEW },
    ],
  },
  {
    title: 'Shaxsiy',
    items: [
      { to: '/profile', label: 'Profil', icon: UserRound },
      { to: '/notifications', label: 'Bildirishnomalar', icon: Bell },
      { to: '/status', label: 'Tizim holati', icon: Activity },
    ],
  },
];
