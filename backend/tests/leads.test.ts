import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { createCourse, createLead, createSource } from './helpers/fixtures.js';

const app = createApp();

type LeadItem = { id: string; code: string; firstName: string; status: string };

function ids(response: request.Response): string[] {
  return (response.body.data as LeadItem[]).map((lead) => lead.id).sort();
}

describe.skipIf(!hasTestDatabase)('Leads API (integratsion)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Ko‘rinish doirasi', () => {
    it('Sales Manager o‘z va biriktirilmagan leadlarni ko‘radi, Admin — hammasini', async () => {
      const source = await createSource();
      const { user: sales, token: salesToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const { user: other } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });

      const own = await createLead({ sourceId: source.id, assignedToId: sales.id });
      const pool = await createLead({ sourceId: source.id });
      const foreign = await createLead({ sourceId: source.id, assignedToId: other.id });

      const salesList = await request(app).get('/api/leads').set(bearer(salesToken));
      const adminList = await request(app).get('/api/leads').set(bearer(adminToken));
      const foreignDetail = await request(app).get(`/api/leads/${foreign.id}`).set(bearer(salesToken));

      expect(ids(salesList)).toEqual([own.id, pool.id].sort());
      expect(ids(adminList)).toEqual([own.id, pool.id, foreign.id].sort());
      expect(foreignDetail.status).toBe(404);
    });

    it('lead.view ruxsati yo‘q rolga 403', async () => {
      const { token } = await createUserWithToken(app, { role: 'TEACHER' });
      expect((await request(app).get('/api/leads').set(bearer(token))).status).toBe(403);
    });
  });

  describe('POST /api/leads', () => {
    it('lead yaratadi, raqam beradi va timeline’ga yozadi', async () => {
      const source = await createSource();
      const course = await createCourse('Frontend');
      const { user, token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });

      const response = await request(app)
        .post('/api/leads')
        .set(bearer(token))
        .send({
          firstName: 'Ali',
          lastName: 'Valiyev',
          phone: '90 123 45 67',
          telegram: 'ali_valiyev',
          age: '19',
          sourceId: source.id,
          courseId: course.id,
          priority: 'HIGH',
          assignedToId: user.id,
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        firstName: 'Ali',
        phone: '+998901234567',
        telegram: '@ali_valiyev',
        age: 19,
        status: 'NEW',
        priority: 'HIGH',
        course: { name: 'Frontend' },
        assignedTo: { id: user.id },
        createdBy: { id: user.id },
      });
      expect(response.body.data.code).toMatch(/^L-\d{6}$/);
      const activities = await prisma.leadActivity.findMany({ where: { leadId: response.body.data.id }, orderBy: { createdAt: 'asc' } });
      expect(activities.map((activity) => activity.type)).toEqual(['CREATED', 'ASSIGNED']);
    });

    it('takroriy telefon uchun 409, allowDuplicate bilan esa yaratiladi', async () => {
      const source = await createSource();
      const { token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      await createLead({ sourceId: source.id, phone: '+998901112233' });
      const payload = { firstName: 'Vali', phone: '+998 90 111 22 33', sourceId: source.id };

      const duplicate = await request(app).post('/api/leads').set(bearer(token)).send(payload);
      const forced = await request(app).post('/api/leads').set(bearer(token)).send({ ...payload, allowDuplicate: true });

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.errors).toEqual([{ field: 'phone', message: 'Bu raqam bilan lead mavjud' }]);
      expect(forced.status).toBe(201);
    });

    it('biriktirish qoidalari: Call Center biriktira olmaydi, Sales faqat o‘ziga, Admin — istalganga (bildirishnoma bilan)', async () => {
      const source = await createSource();
      const { token: callCenterToken } = await createUserWithToken(app, { role: 'CALL_CENTER' });
      const { user: sales, token: salesToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const { user: other } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
      const base = { firstName: 'Mijoz', sourceId: source.id, allowDuplicate: true };

      const callCenterAssign = await request(app).post('/api/leads').set(bearer(callCenterToken)).send({ ...base, phone: '901000001', assignedToId: sales.id });
      const callCenterPool = await request(app).post('/api/leads').set(bearer(callCenterToken)).send({ ...base, phone: '901000002' });
      const salesToOther = await request(app).post('/api/leads').set(bearer(salesToken)).send({ ...base, phone: '901000003', assignedToId: other.id });
      const adminToOther = await request(app).post('/api/leads').set(bearer(adminToken)).send({ ...base, phone: '901000004', assignedToId: other.id });

      expect(callCenterAssign.status).toBe(403);
      expect(callCenterPool.status).toBe(201);
      expect(callCenterPool.body.data.assignedTo).toBeNull();
      expect(salesToOther.status).toBe(403);
      expect(adminToOther.status).toBe(201);
      expect(await prisma.notification.count({ where: { userId: other.id, type: 'NEW_LEAD' } })).toBe(1);
    });

    it('ommaviy biriktirish: har lead yakka qoidalar bilan; rad etilganlari sababi bilan qaytadi', async () => {
      const source = await createSource();
      const { user: sales, token: salesToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const { user: other } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
      const { token: callCenterToken } = await createUserWithToken(app, { role: 'CALL_CENTER' });
      const first = await createLead({ sourceId: source.id });
      const second = await createLead({ sourceId: source.id });
      const foreign = await createLead({ sourceId: source.id, assignedToId: other.id });

      // Admin: uchtasini bitta xodimga; mavjud bo'lmagan ID — xato ro'yxatida, qolganlari to'xtamaydi
      const admin = await request(app)
        .post('/api/leads/bulk-assign')
        .set(bearer(adminToken))
        .send({ ids: [first.id, second.id, 'yoq-lead', first.id], assignedToId: sales.id });
      expect(admin.status).toBe(200);
      expect(admin.body.data.assigned).toBe(2);
      expect(admin.body.data.failed).toEqual([{ id: 'yoq-lead', message: expect.any(String) }]);
      expect(await prisma.lead.count({ where: { assignedToId: sales.id } })).toBe(2);
      // Yakka biriktirishdagi kabi: tarix, bildirishnoma va audit — har lead uchun
      expect(await prisma.notification.count({ where: { userId: sales.id, type: 'LEAD_ASSIGNED' } })).toBe(2);
      expect(await prisma.auditLog.count({ where: { action: 'lead.assigned' } })).toBe(2);
      expect(await prisma.leadActivity.count({ where: { type: 'ASSIGNED', leadId: { in: [first.id, second.id] } } })).toBe(2);

      // Sales: begona managerning leadi unga ko'rinmaydi — biriktirilmaydi
      const bySales = await request(app).post('/api/leads/bulk-assign').set(bearer(salesToken)).send({ ids: [foreign.id], assignedToId: sales.id });
      expect(bySales.status).toBe(200);
      expect(bySales.body.data).toMatchObject({ assigned: 0, failed: [{ id: foreign.id }] });
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: foreign.id } })).assignedToId).toBe(other.id);

      // Ruxsat va validatsiya
      expect((await request(app).post('/api/leads/bulk-assign').set(bearer(callCenterToken)).send({ ids: [first.id], assignedToId: sales.id })).status).toBe(403);
      expect((await request(app).post('/api/leads/bulk-assign').set(bearer(adminToken)).send({ ids: [], assignedToId: sales.id })).status).toBe(422);
      const tooMany = Array.from({ length: 101 }, (_, index) => `id-${index}`);
      expect((await request(app).post('/api/leads/bulk-assign').set(bearer(adminToken)).send({ ids: tooMany, assignedToId: sales.id })).status).toBe(422);
    });

    it('noma’lum manba uchun 422', async () => {
      const { token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const response = await request(app).post('/api/leads').set(bearer(token)).send({ firstName: 'Ali', phone: '901234567', sourceId: 'yoq' });
      expect(response.status).toBe(422);
      expect(response.body.errors).toEqual([{ field: 'sourceId', message: 'Manba topilmadi' }]);
    });
  });

  describe('GET /api/leads — filtrlar', () => {
    it('ism, telefon raqam qismi va lead raqami bo‘yicha qidiradi; status va biriktirish filtrlari ishlaydi', async () => {
      const source = await createSource();
      const { user: admin, token } = await createUserWithToken(app, { role: 'ADMIN' });
      const ali = await createLead({ sourceId: source.id, firstName: 'Ali', lastName: 'Valiyev', phone: '+998901234567', status: 'INTERESTED' });
      const madina = await createLead({ sourceId: source.id, firstName: 'Madina', phone: '+998935556677', assignedToId: admin.id });
      const sardor = await createLead({ sourceId: source.id, firstName: 'Sardor', phone: '+998977778899', status: 'LOST' });

      const byName = await request(app).get('/api/leads').query({ search: 'valiyev' }).set(bearer(token));
      const byPhone = await request(app).get('/api/leads').query({ search: '555 66' }).set(bearer(token));
      const byNumber = await request(app).get('/api/leads').query({ search: `L-${String(sardor.number).padStart(6, '0')}` }).set(bearer(token));
      const byStatus = await request(app).get('/api/leads').query({ status: 'INTERESTED,LOST' }).set(bearer(token));
      const mine = await request(app).get('/api/leads').query({ assignedTo: 'me' }).set(bearer(token));
      const unassigned = await request(app).get('/api/leads').query({ assignedTo: 'unassigned', limit: 1 }).set(bearer(token));

      expect(ids(byName)).toEqual([ali.id]);
      expect(ids(byPhone)).toEqual([madina.id]);
      expect(ids(byNumber)).toEqual([sardor.id]);
      expect(ids(byStatus)).toEqual([ali.id, sardor.id].sort());
      expect(ids(mine)).toEqual([madina.id]);
      expect(unassigned.body.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
    });

    it('summary va kanban statuslar bo‘yicha sonlarni qaytaradi', async () => {
      const source = await createSource();
      const { token } = await createUserWithToken(app, { role: 'ADMIN' });
      await createLead({ sourceId: source.id, status: 'NEW' });
      await createLead({ sourceId: source.id, status: 'NEW' });
      await createLead({ sourceId: source.id, status: 'WON' });

      const summary = await request(app).get('/api/leads/summary').set(bearer(token));
      const kanban = await request(app).get('/api/leads/kanban').query({ perColumn: 1 }).set(bearer(token));

      expect(summary.body.data).toMatchObject({ ALL: 3, NEW: 2, WON: 1, LOST: 0 });
      const columns = kanban.body.data as Array<{ status: string; total: number; items: unknown[] }>;
      expect(columns.map((column) => column.status)).toEqual([
        'NEW', 'CONTACTED', 'CALLBACK', 'INTERESTED', 'TRIAL_BOOKED', 'TRIAL_ATTENDED', 'NEGOTIATION', 'WON', 'LOST',
      ]);
      expect(columns[0]).toMatchObject({ status: 'NEW', total: 2 });
      expect(columns[0]?.items).toHaveLength(1);
    });
  });

  describe('Status, biriktirish, izohlar', () => {
    it('LOST uchun sabab majburiy; status o‘zgarishi timeline’ga yoziladi', async () => {
      const source = await createSource();
      const { user, token } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const lead = await createLead({ sourceId: source.id, assignedToId: user.id });

      const withoutReason = await request(app).patch(`/api/leads/${lead.id}/status`).set(bearer(token)).send({ status: 'LOST' });
      const contacted = await request(app).patch(`/api/leads/${lead.id}/status`).set(bearer(token)).send({ status: 'CONTACTED', comment: 'Qo‘ng‘iroq qilindi' });
      const lost = await request(app).patch(`/api/leads/${lead.id}/status`).set(bearer(token)).send({ status: 'LOST', lostReason: 'Narx qimmat' });

      expect(withoutReason.status).toBe(422);
      expect(contacted.status).toBe(200);
      expect(lost.status).toBe(200);
      expect(lost.body.data).toMatchObject({ status: 'LOST', lostReason: 'Narx qimmat' });
      const changes = await prisma.leadActivity.findMany({ where: { leadId: lead.id, type: 'STATUS_CHANGED' }, orderBy: { createdAt: 'asc' } });
      expect(changes.map((activity) => activity.metadata)).toEqual([
        expect.objectContaining({ from: 'NEW', to: 'CONTACTED', comment: 'Qo‘ng‘iroq qilindi' }),
        expect.objectContaining({ from: 'CONTACTED', to: 'LOST', lostReason: 'Narx qimmat' }),
      ]);
    });

    it('Sales biriktirilmagan leadni o‘ziga oladi; Admin boshqaga o‘tkazganda bildirishnoma ketadi', async () => {
      const source = await createSource();
      const { user: sales, token: salesToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const { user: other } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
      const lead = await createLead({ sourceId: source.id });

      const take = await request(app).patch(`/api/leads/${lead.id}/assign`).set(bearer(salesToken)).send({ assignedToId: sales.id });
      const giveAway = await request(app).patch(`/api/leads/${lead.id}/assign`).set(bearer(salesToken)).send({ assignedToId: other.id });
      const reassign = await request(app).patch(`/api/leads/${lead.id}/assign`).set(bearer(adminToken)).send({ assignedToId: other.id });
      const lostAccess = await request(app).get(`/api/leads/${lead.id}`).set(bearer(salesToken));

      expect(take.status).toBe(200);
      expect(take.body.data.assignedTo.id).toBe(sales.id);
      expect(giveAway.status).toBe(403);
      expect(reassign.status).toBe(200);
      expect(lostAccess.status).toBe(404);
      expect(await prisma.notification.count({ where: { userId: other.id, type: 'LEAD_ASSIGNED' } })).toBe(1);
    });

    it('izoh qo‘shiladi; boshqa xodimning izohini faqat lead.delete ruxsati bilan o‘chirish mumkin', async () => {
      const source = await createSource();
      const { token: salesToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const { token: callCenterToken } = await createUserWithToken(app, { role: 'CALL_CENTER' });
      const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
      const lead = await createLead({ sourceId: source.id });

      const created = await request(app).post(`/api/leads/${lead.id}/notes`).set(bearer(salesToken)).send({ content: 'Kechki guruhni so‘radi' });
      const noteId = created.body.data.id as string;
      const byCallCenter = await request(app).delete(`/api/leads/${lead.id}/notes/${noteId}`).set(bearer(callCenterToken));
      const byAdmin = await request(app).delete(`/api/leads/${lead.id}/notes/${noteId}`).set(bearer(adminToken));

      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ content: 'Kechki guruhni so‘radi' });
      expect(byCallCenter.status).toBe(403);
      expect(byAdmin.status).toBe(200);
      expect(await prisma.leadActivity.count({ where: { leadId: lead.id, type: 'NOTE_ADDED' } })).toBe(1);
    });

    it('tahrirlash faqat o‘zgargan maydonlarni timeline’ga yozadi; o‘chirish soft delete', async () => {
      const source = await createSource();
      const { token: adminToken } = await createUserWithToken(app, { role: 'ADMIN' });
      const { token: salesToken } = await createUserWithToken(app, { role: 'SALES_MANAGER' });
      const lead = await createLead({ sourceId: source.id, firstName: 'Ali', phone: '+998901234567' });

      const update = await request(app)
        .put(`/api/leads/${lead.id}`)
        .set(bearer(adminToken))
        .send({ firstName: 'Ali', phone: '+998901234567', sourceId: source.id, priority: 'URGENT', address: 'Andijon' });
      const salesDelete = await request(app).delete(`/api/leads/${lead.id}`).set(bearer(salesToken));
      const adminDelete = await request(app).delete(`/api/leads/${lead.id}`).set(bearer(adminToken));
      const afterDelete = await request(app).get(`/api/leads/${lead.id}`).set(bearer(adminToken));

      expect(update.status).toBe(200);
      const updated = await prisma.leadActivity.findFirstOrThrow({ where: { leadId: lead.id, type: 'UPDATED' } });
      expect(updated.description).toBe('Ma’lumotlar yangilandi: manzil, muhimlik');
      expect(salesDelete.status).toBe(403);
      expect(adminDelete.status).toBe(200);
      expect(afterDelete.status).toBe(404);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).deletedAt).not.toBeNull();
    });
  });
});
