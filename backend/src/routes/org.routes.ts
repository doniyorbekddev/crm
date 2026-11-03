import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../config/permissions.js';
import type { PermissionKey } from '../config/permissions.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission, requireStaff } from '../middleware/requirePermission.js';
import { assetService } from '../services/org/assets.service.js';
import { orgCatalogService } from '../services/org/catalog.service.js';
import { complaintService } from '../services/org/complaints.service.js';
import { hrService } from '../services/org/hr.service.js';
import { knowledgeService } from '../services/org/knowledge.service.js';
import { orgStructureService } from '../services/org/structure.service.js';
import { performanceService } from '../services/org/performance.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  assetCreateSchema,
  assetEventSchema,
  assetListQuerySchema,
  assetUpdateSchema,
  awardSchema,
  cancelSchema,
  candidateHireSchema,
  candidateListQuerySchema,
  candidateSaveSchema,
  candidateStageSchema,
  checklistCreateSchema,
  checklistItemSchema,
  checklistListQuerySchema,
  complaintAssignSchema,
  complaintCreateSchema,
  complaintListQuerySchema,
  complaintNoteSchema,
  complaintStatusSchema,
  departmentSaveSchema,
  handoverSchema,
  knowledgeListQuerySchema,
  knowledgeSaveSchema,
  knowledgeStatusSchema,
  positionUpdateSchema,
  promotionDecisionSchema,
  promotionSchema,
  responsibilitySchema,
  reviewListQuerySchema,
  reviewPrefillQuerySchema,
  reviewSchema,
  staffAppealSchema,
} from '../validators/org.validator.js';

/**
 * ORG tizimi: tashkiliy tuzilma va katalog, murojaatlar, HR jarayonlari, aktivlar, bilimlar bazasi.
 * Har yo'l: autentifikatsiya, ruxsat (yoki xodim hisobi), kiritish tekshiruvi; o'zgarishlar — audit jurnaliga (servisda).
 */
export const orgRouter = Router();

orgRouter.use(authenticate);

const can = (permission: PermissionKey): RequestHandler => requirePermission(permission);
const staff = requireStaff();
const keyParam = z.object({ key: z.string().trim().min(1).max(40) });
const itemParams = z.object({ id: z.string().trim().min(1).max(50), itemId: z.string().trim().min(1).max(50) });
const versionParams = z.object({ id: z.string().trim().min(1).max(50), version: z.coerce.number().int().min(1) });

// ---------------------------------------------------------------- tuzilma va katalog
orgRouter.get('/structure', can(PERMISSIONS.EMPLOYEE_VIEW), async (req, res) => {
  sendSuccess(res, await orgStructureService.get(requireAuthUser(req)));
});
orgRouter.get('/people', can(PERMISSIONS.EMPLOYEE_VIEW), async (req, res) => {
  sendSuccess(res, await orgStructureService.people(requireAuthUser(req)));
});
orgRouter.get('/departments', can(PERMISSIONS.EMPLOYEE_VIEW), async (req, res) => {
  sendSuccess(res, await orgCatalogService.departments(requireAuthUser(req), req.query.includeInactive === 'true'));
});
orgRouter.post('/departments', can(PERMISSIONS.ORG_MANAGE), async (req, res) => {
  sendCreated(res, await orgCatalogService.saveDepartment(requireAuthUser(req), null, departmentSaveSchema.parse(req.body), getClientInfo(req)), 'Bo‘lim yaratildi');
});
orgRouter.put('/departments/:id', can(PERMISSIONS.ORG_MANAGE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await orgCatalogService.saveDepartment(requireAuthUser(req), id, departmentSaveSchema.parse(req.body), getClientInfo(req)), { message: 'Bo‘lim saqlandi' });
});
orgRouter.get('/departments/spending', can(PERMISSIONS.EXPENSE_VIEW), async (req, res) => {
  const { year, month } = z.object({ year: z.coerce.number().int().min(2020).max(2100), month: z.coerce.number().int().min(1).max(12) }).parse(req.query);
  sendSuccess(res, await orgCatalogService.spending(requireAuthUser(req), year, month));
});
orgRouter.get('/positions', can(PERMISSIONS.EMPLOYEE_VIEW), async (req, res) => {
  sendSuccess(res, await orgCatalogService.positions(requireAuthUser(req)));
});
orgRouter.patch('/positions/:key', can(PERMISSIONS.ORG_MANAGE), async (req, res) => {
  const { key } = keyParam.parse(req.params);
  sendSuccess(res, await orgCatalogService.updatePosition(requireAuthUser(req), key, positionUpdateSchema.parse(req.body), getClientInfo(req)), { message: 'Lavozim saqlandi' });
});
orgRouter.post('/positions/:key/responsibilities', can(PERMISSIONS.ORG_MANAGE), async (req, res) => {
  const { key } = keyParam.parse(req.params);
  sendCreated(res, await orgCatalogService.saveResponsibility(requireAuthUser(req), key, null, responsibilitySchema.parse(req.body), getClientInfo(req)), 'Mas’uliyat qo‘shildi');
});
orgRouter.put('/positions/:key/responsibilities/:id', can(PERMISSIONS.ORG_MANAGE), async (req, res) => {
  const { key } = keyParam.parse(req.params);
  const { id } = idParamSchema.parse({ id: req.params.id });
  sendSuccess(res, await orgCatalogService.saveResponsibility(requireAuthUser(req), key, id, responsibilitySchema.parse(req.body), getClientInfo(req)), { message: 'Mas’uliyat saqlandi' });
});
orgRouter.get('/employees/:id/history', can(PERMISSIONS.EMPLOYEE_VIEW), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await orgCatalogService.history(requireAuthUser(req), { employeeId: id }));
});
orgRouter.get('/users/:id/history', can(PERMISSIONS.EMPLOYEE_VIEW), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await orgCatalogService.history(requireAuthUser(req), { userId: id }));
});

// ---------------------------------------------------------------- murojaatlar
// Ro'yxat va tafsilot: har bir xodim (ko'rinish doirasi servisda — o'zi kiritgan/biriktirilgan yoki `complaint.view`)
orgRouter.get('/complaints', staff, async (req, res) => {
  const query = complaintListQuerySchema.parse(req.query);
  const result = await complaintService.list(requireAuthUser(req), query);
  sendSuccess(res, result);
});
orgRouter.get('/complaints/assignees', can(PERMISSIONS.COMPLAINT_MANAGE), async (req, res) => {
  sendSuccess(res, await complaintService.assignees(requireAuthUser(req)));
});
orgRouter.post('/complaints', can(PERMISSIONS.COMPLAINT_CREATE), async (req, res) => {
  sendCreated(res, await complaintService.create(requireAuthUser(req), complaintCreateSchema.parse(req.body), getClientInfo(req)), 'Murojaat qayd etildi');
});
/** Xodimning o'z rasmiy murojaati (nizo, taklif) — har bir xodim hisobi */
orgRouter.post('/complaints/appeal', staff, async (req, res) => {
  sendCreated(res, await complaintService.createAppeal(requireAuthUser(req), staffAppealSchema.parse(req.body), getClientInfo(req)), 'Murojaatingiz qabul qilindi');
});
orgRouter.get('/complaints/:id', staff, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await complaintService.getById(requireAuthUser(req), id));
});
orgRouter.post('/complaints/:id/assign', can(PERMISSIONS.COMPLAINT_MANAGE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await complaintService.assign(requireAuthUser(req), id, complaintAssignSchema.parse(req.body), getClientInfo(req)), { message: 'Murojaat yo‘naltirildi' });
});
orgRouter.post('/complaints/:id/status', staff, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await complaintService.changeStatus(requireAuthUser(req), id, complaintStatusSchema.parse(req.body), getClientInfo(req)), { message: 'Holat yangilandi' });
});
orgRouter.post('/complaints/:id/escalate', staff, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { note } = complaintNoteSchema.parse(req.body);
  sendSuccess(res, await complaintService.escalate(requireAuthUser(req), id, note, getClientInfo(req)), { message: 'Murojaat rahbarga ko‘tarildi' });
});
orgRouter.post('/complaints/:id/comments', staff, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { note } = complaintNoteSchema.parse(req.body);
  sendSuccess(res, await complaintService.comment(requireAuthUser(req), id, note), { message: 'Izoh qo‘shildi' });
});

// ---------------------------------------------------------------- aktivlar
orgRouter.get('/assets', can(PERMISSIONS.ASSET_VIEW), async (req, res) => {
  sendSuccess(res, await assetService.list(requireAuthUser(req), assetListQuerySchema.parse(req.query)));
});
orgRouter.post('/assets', can(PERMISSIONS.ASSET_MANAGE), async (req, res) => {
  sendCreated(res, await assetService.create(requireAuthUser(req), assetCreateSchema.parse(req.body), getClientInfo(req)), 'Aktiv qo‘shildi');
});
orgRouter.get('/assets/:id', can(PERMISSIONS.ASSET_VIEW), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await assetService.getById(requireAuthUser(req), id));
});
orgRouter.patch('/assets/:id', can(PERMISSIONS.ASSET_MANAGE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await assetService.update(requireAuthUser(req), id, assetUpdateSchema.parse(req.body), getClientInfo(req)), { message: 'Aktiv saqlandi' });
});
orgRouter.post('/assets/:id/events', can(PERMISSIONS.ASSET_MANAGE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await assetService.record(requireAuthUser(req), id, assetEventSchema.parse(req.body), getClientInfo(req)), { message: 'Yozildi' });
});

// ---------------------------------------------------------------- bilimlar bazasi (har bir xodim o'qiydi)
orgRouter.get('/knowledge', staff, async (req, res) => {
  sendSuccess(res, await knowledgeService.list(requireAuthUser(req), knowledgeListQuerySchema.parse(req.query)));
});
orgRouter.get('/knowledge/roles', can(PERMISSIONS.KNOWLEDGE_MANAGE), async (_req, res) => {
  sendSuccess(res, await knowledgeService.roles());
});
orgRouter.post('/knowledge', can(PERMISSIONS.KNOWLEDGE_MANAGE), async (req, res) => {
  sendCreated(res, await knowledgeService.create(requireAuthUser(req), knowledgeSaveSchema.parse(req.body), getClientInfo(req)), 'Hujjat yaratildi');
});
orgRouter.get('/knowledge/:id', staff, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await knowledgeService.getById(requireAuthUser(req), id));
});
orgRouter.get('/knowledge/:id/versions/:version', staff, async (req, res) => {
  const { id, version } = versionParams.parse(req.params);
  sendSuccess(res, await knowledgeService.version(requireAuthUser(req), id, version));
});
orgRouter.put('/knowledge/:id', can(PERMISSIONS.KNOWLEDGE_MANAGE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await knowledgeService.update(requireAuthUser(req), id, knowledgeSaveSchema.parse(req.body), getClientInfo(req)), { message: 'Yangi versiya saqlandi' });
});
orgRouter.post('/knowledge/:id/status', can(PERMISSIONS.KNOWLEDGE_MANAGE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { status } = knowledgeStatusSchema.parse(req.body);
  sendSuccess(res, await knowledgeService.setStatus(requireAuthUser(req), id, status, getClientInfo(req)), { message: 'Holat yangilandi' });
});
orgRouter.post('/knowledge/:id/acknowledge', staff, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await knowledgeService.acknowledge(requireAuthUser(req), id), { message: 'Tanishganingiz qayd etildi' });
});

// ---------------------------------------------------------------- HR: nomzodlar
orgRouter.get('/candidates', can(PERMISSIONS.HIRING_MANAGE), async (req, res) => {
  sendSuccess(res, await hrService.candidates(requireAuthUser(req), candidateListQuerySchema.parse(req.query)));
});
orgRouter.post('/candidates', can(PERMISSIONS.HIRING_MANAGE), async (req, res) => {
  sendCreated(res, await hrService.saveCandidate(requireAuthUser(req), null, candidateSaveSchema.parse(req.body), getClientInfo(req)), 'Nomzod qo‘shildi');
});
orgRouter.get('/candidates/:id', can(PERMISSIONS.HIRING_MANAGE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await hrService.candidate(requireAuthUser(req), id));
});
orgRouter.put('/candidates/:id', can(PERMISSIONS.HIRING_MANAGE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await hrService.saveCandidate(requireAuthUser(req), id, candidateSaveSchema.parse(req.body), getClientInfo(req)), { message: 'Saqlandi' });
});
orgRouter.post('/candidates/:id/stage', can(PERMISSIONS.HIRING_MANAGE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await hrService.moveCandidate(requireAuthUser(req), id, candidateStageSchema.parse(req.body), getClientInfo(req)), { message: 'Bosqich yangilandi' });
});
orgRouter.post('/candidates/:id/hire', can(PERMISSIONS.HIRING_DECIDE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await hrService.hire(requireAuthUser(req), id, candidateHireSchema.parse(req.body), getClientInfo(req)), { message: 'Ishga olindi — onboarding boshlandi' });
});

// ---------------------------------------------------------------- HR: onboarding / offboarding
orgRouter.get('/checklists', can(PERMISSIONS.EMPLOYEE_MANAGE), async (req, res) => {
  sendSuccess(res, await hrService.checklists(requireAuthUser(req), checklistListQuerySchema.parse(req.query)));
});
orgRouter.post('/checklists', can(PERMISSIONS.EMPLOYEE_MANAGE), async (req, res) => {
  sendCreated(res, await hrService.createChecklist(requireAuthUser(req), checklistCreateSchema.parse(req.body), getClientInfo(req)), 'Ro‘yxat ochildi');
});
orgRouter.get('/checklists/:id', can(PERMISSIONS.EMPLOYEE_MANAGE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await hrService.checklist(requireAuthUser(req), id));
});
// Bandni mas'ul ham belgilaydi (rahbar bo'lmasa ham) — tekshiruv servisda
orgRouter.post('/checklists/:id/items/:itemId', staff, async (req, res) => {
  const { id, itemId } = itemParams.parse(req.params);
  sendSuccess(res, await hrService.setItem(requireAuthUser(req), id, itemId, checklistItemSchema.parse(req.body), getClientInfo(req)), { message: 'Saqlandi' });
});
orgRouter.post('/checklists/:id/handover', can(PERMISSIONS.EMPLOYEE_MANAGE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { assigneeId } = handoverSchema.parse(req.body);
  sendSuccess(res, await hrService.handover(requireAuthUser(req), id, assigneeId, getClientInfo(req)), { message: 'Ishlar topshirildi' });
});
orgRouter.post('/checklists/:id/revoke-access', can(PERMISSIONS.EMPLOYEE_MANAGE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await hrService.revokeAccess(requireAuthUser(req), id, getClientInfo(req)), { message: 'CRM kirish huquqi bekor qilindi' });
});
orgRouter.post('/checklists/:id/complete', can(PERMISSIONS.EMPLOYEE_MANAGE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await hrService.complete(requireAuthUser(req), id, getClientInfo(req)), { message: 'Ro‘yxat yakunlandi' });
});
orgRouter.post('/checklists/:id/cancel', can(PERMISSIONS.EMPLOYEE_MANAGE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { note } = cancelSchema.parse(req.body);
  sendSuccess(res, await hrService.cancel(requireAuthUser(req), id, note, getClientInfo(req)), { message: 'Ro‘yxat bekor qilindi' });
});

// ---------------------------------------------------------------- natija va rivojlanish
/** Xodimning o'zi: tasdiqlangan baholashlar, taqdirlashlar, karyera yo'li */
orgRouter.get('/performance/me', staff, async (req, res) => {
  sendSuccess(res, await performanceService.mine(requireAuthUser(req)));
});
orgRouter.get('/performance/reviews', can(PERMISSIONS.PERFORMANCE_VIEW), async (req, res) => {
  sendSuccess(res, await performanceService.reviews(requireAuthUser(req), reviewListQuerySchema.parse(req.query)));
});
orgRouter.get('/performance/reviews/prefill', can(PERMISSIONS.PERFORMANCE_MANAGE), async (req, res) => {
  const { userId, year, quarter } = reviewPrefillQuerySchema.parse(req.query);
  sendSuccess(res, await performanceService.prefill(requireAuthUser(req), userId, year, quarter));
});
orgRouter.post('/performance/reviews', can(PERMISSIONS.PERFORMANCE_MANAGE), async (req, res) => {
  const input = reviewSchema.parse(req.body);
  sendSuccess(res, await performanceService.saveReview(requireAuthUser(req), input, getClientInfo(req)), { message: input.submit ? 'Baholash tasdiqqa yuborildi' : 'Qoralama saqlandi' });
});
orgRouter.post('/performance/reviews/:id/approve', can(PERMISSIONS.PERFORMANCE_APPROVE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await performanceService.approveReview(requireAuthUser(req), id, getClientInfo(req)), { message: 'Baholash tasdiqlandi' });
});
orgRouter.get('/performance/awards', can(PERMISSIONS.PERFORMANCE_VIEW), async (req, res) => {
  const { year } = z.object({ year: z.coerce.number().int().min(2020).max(2100) }).parse(req.query);
  sendSuccess(res, await performanceService.awards(requireAuthUser(req), year));
});
orgRouter.post('/performance/awards', can(PERMISSIONS.PERFORMANCE_MANAGE), async (req, res) => {
  sendCreated(res, await performanceService.addAward(requireAuthUser(req), awardSchema.parse(req.body), getClientInfo(req)), 'Xodim taqdirlandi');
});
orgRouter.get('/performance/careers', can(PERMISSIONS.PERFORMANCE_VIEW), async (req, res) => {
  sendSuccess(res, await performanceService.careers(requireAuthUser(req)));
});
orgRouter.get('/performance/promotions', can(PERMISSIONS.PERFORMANCE_VIEW), async (req, res) => {
  const { status } = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional() }).parse(req.query);
  sendSuccess(res, await performanceService.promotions(requireAuthUser(req), status));
});
orgRouter.post('/performance/promotions', can(PERMISSIONS.PERFORMANCE_MANAGE), async (req, res) => {
  sendCreated(res, await performanceService.recommend(requireAuthUser(req), promotionSchema.parse(req.body), getClientInfo(req)), 'Tavsiya yuborildi');
});
orgRouter.post('/performance/promotions/:id/decide', can(PERMISSIONS.PERFORMANCE_APPROVE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { decision, note } = promotionDecisionSchema.parse(req.body);
  sendSuccess(res, await performanceService.decidePromotion(requireAuthUser(req), id, decision, note, getClientInfo(req)), { message: decision === 'APPROVED' ? 'Lavozimga ko‘tarildi' : 'Tavsiya rad etildi' });
});
