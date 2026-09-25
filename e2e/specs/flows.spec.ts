import type { Page } from '@playwright/test';
import { API, apiLogin, createQuestion, createTopic, linkStudentTelegram, prepareFamily, telegramPress, telegramTitles } from '../flows';
import { PORTAL_PASSWORD, expect, login, loginWithTemporaryPassword, test } from '../fixtures';

/**
 * TZ 3.0 §64–66 — to'liq foydalanuvchi oqimlari, bir nechta rol ketma-ket, **UI orqali**.
 * API faqat boshlang'ich ma'lumot uchun (kabinet ochish, savollar banki) — tekshiriladigan qadamlar
 * foydalanuvchi bosadigan tugmalar orqali bajariladi.
 */

test.describe.configure({ timeout: 150_000 });

async function signOut(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/login');
  await expect(page.getByLabel('Login', { exact: true })).toBeVisible();
}

async function portalLogin(page: Page, loginName: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Login', { exact: true }).fill(loginName);
  await page.getByLabel('Parol', { exact: true }).fill(PORTAL_PASSWORD);
  await page.getByRole('button', { name: 'Kirish', exact: true }).click();
  await expect(page).toHaveURL(/\/portal$/);
}

async function openPortalSection(page: Page, name: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Kabinet bo‘limlari' }).first().getByRole('link', { name }).click();
}

async function openStudentAi(page: Page, studentId: string) {
  await page.goto(`/students/${studentId}`);
  await page.getByRole('tab', { name: 'AI tahlil' }).click();
  await page.getByRole('button', { name: /^(Tahlil qilish|Yangilash)$/ }).click();
  await expect(page.getByRole('region', { name: 'Fakt' })).toBeVisible();
}

test('§64 vazifa: o‘qituvchi beradi → o‘quvchi topshiradi → AI tekshiradi → o‘qituvchi baholaydi → o‘quvchi, ota-ona va Telegram', async ({ page, request }) => {
  const family = await prepareFamily(request);
  const title = `Oqim vazifasi ${Date.now()}`;

  // 1. O'qituvchi guruhga vazifa beradi
  await login(page, 'teacher');
  await page.goto('/homework');
  await page.getByRole('button', { name: 'Vazifa berish' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Sarlavha').fill(title);
  await form.getByLabel(/^Guruh/).selectOption(family.groupId);
  await form.getByLabel('Tavsif').fill('Funksiya yozing va natijasini tushuntiring');
  await form.getByRole('button', { name: 'Saqlash' }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await signOut(page);

  // 2–4. Guruh o'quvchisi oladi, ochadi va topshiradi
  await loginWithTemporaryPassword(page, family.student.login, family.student.password);
  await expect(page.getByText(new RegExp(title))).toBeVisible();
  await page.goto('/portal/homework');
  await page.getByRole('link', { name: title }).click();
  await page.getByLabel('Javob matni').fill('function sum(a, b) { return a + b } — ikki sonni qo‘shadi.');
  await page.getByRole('button', { name: 'Topshirish' }).click();
  await expect(page.getByText('Topshirdi', { exact: true })).toBeVisible();
  await signOut(page);

  // 5–7. O'qituvchi topshiriqni ko'radi, AI tekshiradi (qoidalar rejimi), o'zi baholaydi
  await login(page, 'teacher');
  await page.goto('/homework');
  await page.getByText(title, { exact: true }).click();
  const detail = page.getByRole('dialog', { name: title });
  await detail.getByRole('listitem').filter({ hasText: family.student.name }).getByRole('button', { name: 'Ko‘rish' }).click();
  const review = page.getByRole('dialog', { name: family.student.name });
  await expect(review.getByText('function sum(a, b)')).toBeVisible();
  await review.getByRole('button', { name: 'AI bilan tekshirish' }).click();
  const ai = review.getByRole('region', { name: 'AI tekshiruv' });
  await expect(ai.getByRole('region', { name: 'Fakt' })).toBeVisible();
  await review.getByLabel('Ball (0–100)').fill('85');
  await review.getByLabel('Izoh').fill('Yaxshi ish, misollar qo‘shing');
  await review.getByRole('button', { name: 'Baholash' }).click();
  await expect(review).toBeHidden();
  await signOut(page);

  // 8. O'quvchi natijani ko'radi
  await portalLogin(page, family.student.login);
  await openPortalSection(page, 'Vazifalar');
  const studentRow = page.getByRole('listitem').filter({ hasText: title });
  await expect(studentRow).toContainText('85/100');
  await expect(studentRow).toContainText('Izoh: Yaxshi ish, misollar qo‘shing');
  await signOut(page);

  // 9. Ota-ona natijani ko'radi
  await loginWithTemporaryPassword(page, family.parent.phone, family.parent.password);
  await openPortalSection(page, 'Vazifalar');
  await expect(page.getByRole('listitem').filter({ hasText: title })).toContainText('85/100');
  await page.goto('/portal/notifications');
  await expect(page.getByRole('listitem').filter({ hasText: 'Vazifa baholandi' }).first()).toBeVisible();

  // 10. Telegram: ota-onaga e'lon va baho xabari navbatga yozilgan
  await expect.poll(() => telegramTitles(family.parent.id)).toEqual(expect.arrayContaining(['Yangi uy vazifasi', 'Vazifa baholandi']));
});

test('§65 imtihon: blueprint → o‘quvchi vaqt bilan topshiradi → avto + qo‘lda baholash → natija, progress, AI, ota-ona', async ({ page, request }) => {
  const family = await prepareFamily(request);
  const stamp = Date.now();
  const topicTitle = `Oqim mavzusi ${stamp}`;
  const topicId = await createTopic(request, family.admin, family.courseId, topicTitle);
  for (const index of [1, 2]) {
    await createQuestion(request, family.admin, { courseId: family.courseId, topicId, text: `${topicTitle}: ${index}-savol`, options: [{ text: 'To‘g‘ri', isCorrect: true }, { text: 'Noto‘g‘ri' }] });
  }
  await createQuestion(request, family.admin, { courseId: family.courseId, topicId, type: 'LONG_TEXT', points: 2, text: `${topicTitle}: o‘z so‘zingiz bilan tushuntiring` });
  const title = `Oqim imtihoni ${stamp}`;

  // 1–3. O'qituvchi imtihon yaratadi, blueprint bilan savollar bankidan tanlaydi
  await login(page, 'teacher');
  await page.goto('/exams');
  await page.getByRole('button', { name: 'Imtihon qo‘shish' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Sarlavha').fill(title);
  await form.getByLabel(/^Guruh/).selectOption(family.groupId);
  await form.getByLabel('O‘quvchilar kabinetdan o‘zi topshiradi').check();
  await form.getByLabel('Davomiyligi (daqiqa)').fill('30');
  await form.getByLabel('Har o‘quvchiga savollar bankidan alohida tasodifiy variant').check();
  await form.getByLabel('Savollar soni').fill('3');
  await form.getByRole('button', { name: 'Mavzu qo‘shish' }).click();
  const topicSelect = form.getByLabel('1-mavzu', { exact: true });
  await topicSelect.selectOption((await topicSelect.locator('option', { hasText: topicTitle }).getAttribute('value'))!);
  await form.getByLabel('1-mavzu ulushi (%)').fill('100');
  await form.getByRole('button', { name: 'Bankni tekshirish' }).click();
  await expect(form.getByText('Bankda 3 ta mos savol bor')).toBeVisible();
  await form.getByRole('button', { name: 'Saqlash' }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await signOut(page);

  // 4–7. O'quvchi boshlaydi, taymer, javoblar saqlanadi, topshiradi
  await loginWithTemporaryPassword(page, family.student.login, family.student.password);
  await page.goto('/portal/exams');
  await page.getByRole('listitem').filter({ hasText: title }).getByRole('button', { name: 'Boshlash' }).click();
  await expect(page.getByRole('timer', { name: 'Qolgan vaqt' })).toBeVisible();
  const radios = page.getByRole('radio', { name: 'To‘g‘ri', exact: true });
  await expect(radios).toHaveCount(2);
  await radios.nth(0).check();
  await radios.nth(1).check();
  await page.getByRole('textbox').fill('Mavzu ma’lumotni tartiblab saqlash haqida.');
  await expect(page.getByText('Saqlandi', { exact: true })).toHaveCount(3);
  await page.getByRole('button', { name: 'Topshirish' }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Topshirish' }).click();

  // 8. Avtomatik baholash: variantli savollar baholandi, matnli javob o'qituvchida
  await expect(page.getByText('O‘qituvchi tekshirmoqda')).toBeVisible();
  await expect(page.getByText('2/4 ball')).toBeVisible();
  await signOut(page);

  // 9. O'qituvchi matnli javobni qo'lda baholaydi
  await login(page, 'teacher');
  await page.goto('/exams');
  await page.getByRole('button', { name: `${title} amallari` }).click();
  await page.getByRole('menuitem', { name: 'Savollar va tahlil' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Baholash' }).click();
  const grading = page.getByRole('dialog', { name: 'Javoblarni baholash' });
  await expect(grading.getByText('Mavzu ma’lumotni tartiblab saqlash haqida.')).toBeVisible();
  await grading.getByLabel('Ball (0–2)').fill('2');
  await grading.getByRole('button', { name: 'Baholash' }).click();
  await expect(grading).toBeHidden();
  await expect(page.getByRole('dialog').getByText('100%').first()).toBeVisible();

  // 12. AI tahlil yangilangan natijani hisobga oladi
  await openStudentAi(page, family.student.id);
  await expect(page.getByRole('region', { name: 'Fakt' })).toContainText('Mavzular o‘zlashtirishi');
  await signOut(page);

  // 10–11. O'quvchi yakuniy natijani va progressni ko'radi
  await portalLogin(page, family.student.login);
  await page.goto('/portal/exams');
  // Onlayn imtihonlar kartasi va natijalar ro'yxati: 100% va imtihon shkalasida 100/100 — "O'tdi"
  await expect(page.getByRole('listitem').filter({ hasText: title }).filter({ hasText: 'Oxirgi:' })).toContainText('100%');
  const resultRow = page.getByRole('listitem').filter({ hasText: title }).filter({ hasText: '100/100' });
  await expect(resultRow).toContainText('O‘tdi');
  await openPortalSection(page, 'Progress');
  await expect(page.getByRole('meter', { name: `${topicTitle} o‘zlashtirish` })).toHaveAttribute('aria-valuenow', '100');
  await signOut(page);

  // 13. Ota-onaga xabar (ilova + Telegram navbati)
  await loginWithTemporaryPassword(page, family.parent.phone, family.parent.password);
  await page.goto('/portal/notifications');
  await expect(page.getByRole('listitem').filter({ hasText: 'Imtihon natijasi' }).first()).toBeVisible();
  await expect.poll(() => telegramTitles(family.parent.id)).toContain('Imtihon natijasi');
});

test('§66 AI: past natija → risk, sabab, tavsiya → o‘qituvchi remedial rejani tasdiqlaydi → o‘quvchi takrorlaydi → progress oshadi', async ({ page, request }) => {
  const family = await prepareFamily(request);
  const stamp = Date.now();
  const topicTitle = `Zaif mavzu ${stamp}`;
  const topicId = await createTopic(request, family.admin, family.courseId, topicTitle);
  const questionIds: string[] = [];
  for (const index of [1, 2, 3]) {
    questionIds.push(await createQuestion(request, family.admin, { courseId: family.courseId, topicId, text: `${topicTitle}: ${index}-savol`, options: [{ text: 'To‘g‘ri', isCorrect: true }, { text: 'Noto‘g‘ri' }] }));
  }

  // 1. O'quvchi ma'lumoti: mavzu bo'yicha imtihonda hamma javob noto'g'ri (o'qituvchi kiritgan natija)
  const teacher = await apiLogin(request, 'teacher');
  const exam = await request.post(`${API}/exams`, { headers: teacher, data: { title: `Diagnostika ${stamp}`, groupId: family.groupId, date: new Date().toISOString().slice(0, 10) } });
  expect(exam.status()).toBe(201);
  const examId = (await exam.json()).data.id as string;
  expect((await request.post(`${API}/exams/${examId}/questions`, { headers: teacher, data: { questionIds } })).status()).toBe(200);
  const attached = (await (await request.get(`${API}/exams/${examId}/questions`, { headers: teacher })).json()).data as Array<{ examQuestionId: string; options: Array<{ id: string; text: string }> }>;
  const wrong = await request.post(`${API}/exams/${examId}/attempts/${family.student.id}`, {
    headers: teacher,
    data: { answers: attached.map((row) => ({ examQuestionId: row.examQuestionId, optionIds: [row.options.find((option) => option.text === 'Noto‘g‘ri')!.id] })) },
  });
  expect(wrong.status()).toBe(201);

  // 2–5. O'qituvchi AI tahlilini ochadi: risk, sabab (kuzatuv), tavsiya
  await login(page, 'teacher');
  await openStudentAi(page, family.student.id);
  await expect(page.getByText(/^Risk: /)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Kuzatuv' })).toContainText(topicTitle);
  // Tavsiya eng zaif mavzuni nomlaydi (qayta ishga tushirilganda o'quvchida oldingi zaif mavzu bo'lishi mumkin)
  await expect(page.getByRole('region', { name: 'Tavsiya' })).toContainText(/mavzusi bo‘yicha remedial reja: takrorlash darsi, kichik vazifa va 10 savollik quiz/);

  // 6–7. O'qituvchi guruh tahlilidan remedial rejani tasdiqlaydi (AI yakuniy qaror qabul qilmaydi)
  await page.goto(`/teaching/groups/${family.groupId}`);
  await page.getByRole('button', { name: 'AI tahlil' }).click();
  const groupAi = page.getByRole('dialog', { name: 'AI guruh tahlili' });
  await groupAi.getByRole('button', { name: /^(Tahlil qilish|Yangilash)$/ }).click();
  await groupAi.getByRole('listitem').filter({ hasText: `${topicTitle}: mustahkamlash darsi` }).getByRole('button', { name: 'Remedial reja' }).click();
  await expect(groupAi.getByRole('heading', { name: `Remedial reja: ${topicTitle}` })).toBeVisible();
  await groupAi.getByRole('button', { name: 'Tasdiqlash' }).click();
  await expect(groupAi.getByText('Yaratildi:')).toBeVisible();
  await signOut(page);

  // 8. O'quvchi takrorlash testini topshiradi — mavzu o'zlashtirishi oshadi
  await loginWithTemporaryPassword(page, family.student.login, family.student.password);
  await openPortalSection(page, 'Progress');
  const meter = page.getByRole('meter', { name: `${topicTitle} o‘zlashtirish` });
  await expect(meter).toHaveAttribute('aria-valuenow', '0');

  await page.goto('/portal/exams');
  await page.getByRole('listitem').filter({ hasText: `Takrorlash testi: ${topicTitle}` }).getByRole('button', { name: 'Boshlash' }).click();
  const radios = page.getByRole('radio', { name: 'To‘g‘ri', exact: true });
  await expect(radios).toHaveCount(3);
  for (const index of [0, 1, 2]) await radios.nth(index).check();
  await expect(page.getByText('Saqlandi', { exact: true })).toHaveCount(3);
  await page.getByRole('button', { name: 'Topshirish' }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Topshirish' }).click();
  await expect(page.getByText('100%')).toBeVisible();

  await openPortalSection(page, 'Progress');
  await expect.poll(async () => Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
});

test('§35 Telegram imtihon: o‘quvchi botda boshlaydi, javob beradi, topshiradi — natija CRM va web kabinetda', async ({ page, request }) => {
  const family = await prepareFamily(request);
  const stamp = Date.now();
  const topicTitle = `Bot mavzusi ${stamp}`;
  const topicId = await createTopic(request, family.admin, family.courseId, topicTitle);
  const questionId = await createQuestion(request, family.admin, { courseId: family.courseId, topicId, text: `${topicTitle}: 3 + 4 = ?`, options: [{ text: 'Yetti', isCorrect: true }, { text: 'Sakkiz' }] });
  const title = `Telegram imtihoni ${stamp}`;
  const exam = await request.post(`${API}/exams`, { headers: family.admin, data: { title, groupId: family.groupId, date: new Date().toISOString().slice(0, 10), isOnline: true, durationMinutes: 20 } });
  expect(exam.status()).toBe(201);
  const examId = (await exam.json()).data.id as string;
  expect((await request.post(`${API}/exams/${examId}/questions`, { headers: family.admin, data: { questionIds: [questionId] } })).status()).toBe(200);

  // Bot: tafsilot → boshlash → tasdiq → javob (variant tartibi aralashmagan — "Yetti" birinchi) → tugatish → tasdiq
  const chatId = Number(String(stamp).slice(-9));
  await linkStudentTelegram(family.student.id, chatId);
  for (const data of [`ex_info:${examId}`, `ex_start:${examId}`, `ex_go:${examId}`, 'ex_a:0:0', 'ex_sub', 'ex_subok']) {
    await telegramPress(request, chatId, data);
  }

  // CRM: xodim urinishni ko'radi
  const attempts = await request.get(`${API}/exams/${examId}/attempts`, { headers: family.admin });
  expect((await attempts.json()).data).toEqual([expect.objectContaining({ status: 'GRADED', percentage: 100 })]);

  // Web kabinet: o'sha natija
  await loginWithTemporaryPassword(page, family.student.login, family.student.password);
  await page.goto('/portal/exams');
  await expect(page.getByRole('listitem').filter({ hasText: title }).filter({ hasText: 'Oxirgi:' })).toContainText('100%');
});
