/* eslint-disable no-console -- CLI skript: natija terminalga chiqariladi */
/**
 * Ishlab chiqarish (production) uchun birlamchi sozlash — demo ma'lumotlarsiz.
 *
 *   ADMIN_EMAIL=admin@markaz.uz ADMIN_PASSWORD='Kuchli Parol1' npm run db:bootstrap
 *
 * Nima qiladi (hammasi idempotent — qayta ishga tushirsa ham takrorlanmaydi):
 *   1. permissionlar va tizim rollari (Super Admin, Direktor, Menejer, O‘qituvchi, Buxgalter, Call-center);
 *   2. lead manbalari, tushum/xarajat kategoriyalari, kassalar, XP qoidalari, darajalar va nishonlar;
 *   3. markaz sozlamalari (nom, telefon, manzil, valyuta, ish vaqti, follow-up eslatmasi);
 *   4. bitta Super Admin foydalanuvchi — parol faqat shu buyruqni bergan odamga ma'lum.
 *
 * `npm run db:seed` dan farqi: bu skript demo lead, o‘quvchi, to‘lov va oldindan ma'lum
 * parolli sinov xodimlarini YARATMAYDI. Shuning uchun serverda faqat shu buyruq ishlatiladi.
 *
 * Qo‘shimcha env o‘zgaruvchilari:
 *   ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_PHONE   — admin ma'lumotlari
 *   COMPANY_NAME, COMPANY_PHONE, COMPANY_ADDRESS, COMPANY_TELEGRAM — markaz ma'lumotlari
 *   ADMIN_RESET_PASSWORD=yes — admin allaqachon mavjud bo‘lsa parolini yangilash
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { config } from 'dotenv';
import { ROLE_KEYS } from '../src/config/permissions.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { normalizePhone } from '../src/validators/common.validator.js';
import { seedReferenceData } from './academySeed.js';
import { seedLeadSources, seedRolesAndPermissions } from './coreSeed.js';

config({ quiet: true });

const BCRYPT_ROUNDS = 12;

function log(message: string): void {
  console.log(message);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) fail('DATABASE_URL topilmadi. .env faylini tekshiring.');

/** Admin ma'lumotlari env'dan olinadi va auth validatoridagi qoidalar bilan tekshiriladi */
function readAdminCredentials(): { email: string; password: string } {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    fail("ADMIN_EMAIL va ADMIN_PASSWORD kerak:\n  ADMIN_EMAIL=admin@markaz.uz ADMIN_PASSWORD='Kuchli Parol1' npm run db:bootstrap");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(`ADMIN_EMAIL noto‘g‘ri: ${email}`);

  const problems: string[] = [];
  if (password.length < 8) problems.push('kamida 8 belgi');
  if (Buffer.byteLength(password, 'utf8') > 72) problems.push('72 baytdan oshmasligi');
  if (!/[a-z]/.test(password)) problems.push('kamida bitta kichik harf');
  if (!/[A-Z]/.test(password)) problems.push('kamida bitta katta harf');
  if (!/\d/.test(password)) problems.push('kamida bitta raqam');
  if (problems.length > 0) fail(`ADMIN_PASSWORD talablarga javob bermaydi: ${problems.join(', ')}.`);

  return { email, password };
}

const { email, password } = readAdminCredentials();

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function upsertSettings(adminId: string): Promise<void> {
  const settings: ReadonlyArray<{ key: string; value: Record<string, string | number | boolean>; description: string }> = [
    {
      key: 'company',
      value: {
        name: process.env.COMPANY_NAME?.trim() || 'O‘quv markaz',
        phone: process.env.COMPANY_PHONE?.trim() || '',
        address: process.env.COMPANY_ADDRESS?.trim() || '',
        telegram: process.env.COMPANY_TELEGRAM?.trim() || '',
      },
      description: 'O‘quv markaz ma’lumotlari',
    },
    { key: 'currency', value: { code: 'UZS', symbol: 'so‘m' }, description: 'Valyuta' },
    { key: 'followUp', value: { reminderMinutesBefore: 30, overdueNotify: true }, description: 'Follow-up eslatma sozlamalari' },
    { key: 'workingHours', value: { start: '09:00', end: '20:00' }, description: 'Ish vaqti' },
  ];

  for (const setting of settings) {
    // Mavjud sozlama qayta yozilmaydi — sozlamalar sahifasidagi o‘zgarishlar saqlanadi
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: { key: setting.key, value: setting.value, description: setting.description, updatedById: adminId },
    });
  }
  log(`✔ ${settings.length} ta sozlama`);
}

async function upsertAdmin(roleId: string): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, deletedAt: true } });
  const phone = process.env.ADMIN_PHONE?.trim() ? normalizePhone(process.env.ADMIN_PHONE.trim()) : null;
  const firstName = process.env.ADMIN_FIRST_NAME?.trim() || 'Super';
  const lastName = process.env.ADMIN_LAST_NAME?.trim() || 'Admin';

  if (!existing) {
    const created = await prisma.user.create({
      data: {
        email,
        passwordHash: await hash(password, BCRYPT_ROUNDS),
        firstName,
        lastName,
        phone,
        roleId,
        status: 'ACTIVE',
        passwordChangedAt: new Date(),
      },
      select: { id: true },
    });
    log(`✔ Super Admin yaratildi: ${email}`);
    return { id: created.id, created: true };
  }

  const resetPassword = process.env.ADMIN_RESET_PASSWORD === 'yes';
  await prisma.user.update({
    where: { id: existing.id },
    data: {
      roleId,
      status: 'ACTIVE',
      deletedAt: null,
      ...(resetPassword ? { passwordHash: await hash(password, BCRYPT_ROUNDS), passwordChangedAt: new Date() } : {}),
    },
  });
  log(
    resetPassword
      ? `✔ Mavjud admin (${email}) paroli yangilandi va faollashtirildi`
      : `✔ Mavjud admin (${email}) Super Admin rolida faol. Parolni yangilash uchun: ADMIN_RESET_PASSWORD=yes`,
  );
  return { id: existing.id, created: false };
}

async function main(): Promise<void> {
  log('\nBirlamchi sozlash boshlandi...\n');

  const roleIdByKey = await seedRolesAndPermissions(prisma, log);
  const superAdminRoleId = roleIdByKey.get(ROLE_KEYS.SUPER_ADMIN);
  if (!superAdminRoleId) throw new Error('Super Admin roli topilmadi');

  await seedLeadSources(prisma, log);
  await seedReferenceData(prisma, log);

  const admin = await upsertAdmin(superAdminRoleId);
  await upsertSettings(admin.id);

  const [users, leads, students] = await Promise.all([prisma.user.count(), prisma.lead.count(), prisma.student.count()]);
  log(`\nBazada: ${users} ta xodim, ${leads} ta lead, ${students} ta o‘quvchi.`);
  log('\n✔ Tayyor. CRM ga kiring:');
  log(`  Email: ${email}`);
  log('  Parol: (ADMIN_PASSWORD da kiritilgan parol)');
  log('\nKeyingi qadam: Sozlamalar → Xodimlar bo‘limida qolgan xodimlarni qo‘shing.\n');
}

main()
  .catch((error: unknown) => {
    console.error(`\nBirlamchi sozlash xatolik bilan tugadi:\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
