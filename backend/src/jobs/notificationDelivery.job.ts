import { notificationDeliveryService } from '../services/notificationDelivery.service.js';
import { reportJobFailure } from '../services/observability.js';

/**
 * Yetkazish navbatini qayta ishlaydi. Har daqiqada — foydalanuvchi xabarni tez olishi kerak,
 * lekin asosiy so'rov uni kutib qolmasligi ham kerak.
 */
const INTERVAL_MS = 60_000;

let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await notificationDeliveryService.processQueue(new Date());
  } catch (error) {
    reportJobFailure('notificationDelivery', error, 'Yetkazish navbati jobida xatolik');
  } finally {
    running = false;
  }
}

export function startNotificationDeliveryJob(): () => void {
  const timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref();
  void runOnce();
  return () => clearInterval(timer);
}
