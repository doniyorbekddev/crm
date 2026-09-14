import type { APIRequestContext } from '@playwright/test';
import { API_PORT } from '../env';
import { USERS, expect, login, test } from '../fixtures';

const API = `http://localhost:${API_PORT}/api`;

interface StudentRow {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  course: { id: string; name: string };
  group: { id: string; name: string } | null;
}

interface FormGroup {
  id: string;
  name: string;
  courseId: string;
  freeSeats: number;
}

async function findCandidate(request: APIRequestContext): Promise<{ student: StudentRow; target: FormGroup } | null> {
  const auth = await request.post(`${API}/auth/login`, { data: { email: USERS.admin.email, password: USERS.admin.password } });
  const headers = { Authorization: `Bearer ${(await auth.json()).data.accessToken as string}` };
  const students = (await (await request.get(`${API}/students`, { params: { limit: 100, status: 'ACTIVE' }, headers })).json()).data as StudentRow[];
  const groups = (await (await request.get(`${API}/lookups/student-form`, { headers })).json()).data.groups as FormGroup[];
  for (const student of students) {
    if (!student.group) continue;
    const target = groups.find((group) => group.courseId === student.course.id && group.id !== student.group?.id && group.freeSeats > 0);
    if (target) return { student, target };
  }
  return null;
}

test('admin o‘quvchini boshqa guruhga sabab bilan o‘tkazadi va profilda guruh tarixi ko‘rinadi', async ({ page, request }) => {
  const candidate = await findCandidate(request);
  expect(candidate, 'seed bazasida bir kursda ikki guruh bo‘lishi kerak').not.toBeNull();
  if (!candidate) return;
  const { student, target } = candidate;
  const fromName = student.group?.name ?? '';

  await login(page, 'admin');
  await page.goto('/students');
  await page.getByPlaceholder(/Ism, telefon/).fill(student.code);
  const row = page.getByRole('row').filter({ hasText: student.code });
  await row.getByRole('button', { name: /amallari/ }).click();
  await page.getByRole('menuitem', { name: 'Guruhga o‘tkazish' }).click();

  const dialog = page.getByRole('dialog', { name: 'Guruhga o‘tkazish' });
  await dialog.getByLabel('Yangi guruh').selectOption(target.id);
  await dialog.getByLabel('Sabab').fill('Dars vaqti to‘g‘ri kelmadi');
  await dialog.getByRole('button', { name: 'O‘tkazish' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText(target.name);

  await page.goto(`/students/${student.id}`);
  await page.getByRole('tab', { name: 'Guruh tarixi' }).click();
  const latest = page.getByRole('listitem').filter({ hasText: 'Dars vaqti to‘g‘ri kelmadi' }).first();
  await expect(latest).toContainText(fromName);
  await expect(latest).toContainText(target.name);
  await expect(latest).toContainText(USERS.admin.name);
});
