import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Development seed foydalanuvchilari (backend/prisma/seed.ts) */
export const USERS = {
  admin: { email: 'admin@example.com', password: 'Admin123!', name: 'Jamshid Karimov' },
  owner: { email: 'owner@example.com', password: 'Owner123!', name: 'Sherzod Abdullayev' },
  manager: { email: 'manager@example.com', password: 'Manager123!', name: 'Dilshod Rahimov' },
  teacher: { email: 'teacher@example.com', password: 'Teacher123!', name: 'Bobur Ismoilov' },
  accountant: { email: 'accountant@example.com', password: 'Accountant123!', name: 'Gulnora Saidova' },
} as const;

export type SeedUser = keyof typeof USERS;

export async function fillLogin(page: Page, user: SeedUser, password: string = USERS[user].password): Promise<void> {
  await page.getByLabel('Login', { exact: true }).fill(USERS[user].email);
  await page.getByLabel('Parol', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Kirish', exact: true }).click();
}

export async function login(page: Page, user: SeedUser): Promise<void> {
  await page.goto('/login');
  await fillLogin(page, user);
  await expect(page).not.toHaveURL(/\/login/);
}

/** Kirgan foydalanuvchi login sahifasidan qaytariladi — boshqa rol bilan kirishdan oldin chiqish kerak */
export async function logout(page: Page, user: SeedUser): Promise<void> {
  await page.getByRole('button', { name: new RegExp(USERS[user].name) }).click();
  await page.getByText('Chiqish', { exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Kabinet foydalanuvchisi yangi parolni shu qiymatga almashtiradi */
export const PORTAL_PASSWORD = 'MeningParolim2026';

/**
 * Vaqtinchalik parol bilan kiradi: tizim avval parolni almashtirish sahifasiga olib boradi,
 * yangi parol o'rnatilgach kabinetga o'tadi.
 */
export async function loginWithTemporaryPassword(page: Page, login: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Login', { exact: true }).fill(login);
  await page.getByLabel('Parol', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Kirish', exact: true }).click();
  await expect(page).toHaveURL(/\/change-password$/);
  // Parol almashtirilmaguncha kabinet ochilmaydi
  await page.goto('/portal');
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByLabel('Joriy parol', { exact: true }).fill(password);
  await page.getByLabel('Yangi parol', { exact: true }).fill(PORTAL_PASSWORD);
  await page.getByLabel('Yangi parolni takrorlang', { exact: true }).fill(PORTAL_PASSWORD);
  await page.getByRole('button', { name: 'Parolni saqlash' }).click();
  await expect(page).toHaveURL(/\/portal$/);
}

/** Takrorlanmas harfli yorliq — ism maydonlari raqam qabul qilmaydi */
export function uniqueLetters(length = 6): string {
  return String(Date.now())
    .slice(-length)
    .replace(/\d/g, (digit) => 'abcdefghij'[Number(digit)] ?? 'a');
}

export function uniquePhone(): string {
  return `+99899${String(Date.now()).slice(-7)}`;
}

/** Brauzer so'rovi muvaffaqiyatsiz bo'lganda chiqadigan umumiy yozuv — javob holati testning o'zida tekshiriladi */
const IGNORED_CONSOLE = [/Failed to load resource/];

/** Har testda brauzer konsolidagi xato va ushlanmagan istisno testni yiqitadi */
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (!IGNORED_CONSOLE.some((pattern) => pattern.test(text))) problems.push(`console.error: ${text}`);
      });
      await use();
      expect(problems, problems.join('\n')).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
