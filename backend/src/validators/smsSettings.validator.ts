import { z } from 'zod';
import { SMS_NOTIFICATION_TYPES } from '../services/smsSettings.service.js';

const smsType = z.enum(SMS_NOTIFICATION_TYPES.map((item) => item.type) as [string, ...string[]]);

export const smsSettingsSchema = z.object({
  enabled: z.boolean(),
  types: z.array(smsType).max(SMS_NOTIFICATION_TYPES.length),
  recipients: z.enum(['PARENTS', 'PARENTS_AND_STUDENTS']),
  dailyLimit: z.number().int('Butun son kiriting').min(1, 'Kamida 1').max(5000, 'Ko‘pi bilan 5000'),
});

export const smsTestSchema = z.object({
  phone: z.string().trim().min(9, 'Telefon raqamini kiriting').max(32),
  message: z.string().trim().min(1, 'Matnni kiriting').max(320, 'Ko‘pi bilan 320 belgi').default('Bu Eskiz dan test'),
});
