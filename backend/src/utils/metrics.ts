/**
 * Minimal Prometheus metrikalari (TZ 3.0 §68 "Observability") — tashqi kutubxonasiz.
 *
 * Nega o'zimizniki: kerakli narsa — hisoblagich, gistogramma va o'lchagich (gauge) hamda matn
 * formati; bunga qo'shimcha bog'liqlik (supply-chain) qo'shish shart emas. Format Prometheus
 * exposition 0.0.4 ga mos, shuning uchun Grafana/Prometheus to'g'ridan-to'g'ri o'qiydi.
 *
 * Yorliqlar (label) **kam kardinallikda**: yo'l — Express marshrut shabloni (`/students/:id`),
 * ID emas; foydalanuvchi ma'lumoti hech qachon yorliqqa yozilmaydi.
 */

type Labels = Record<string, string>;

function labelKey(labels: Labels): string {
  return Object.keys(labels)
    .sort()
    .map((key) => `${key}="${String(labels[key]).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`)
    .join(',');
}

class Counter {
  private readonly values = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}
  inc(labels: Labels = {}, value = 1): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    if (this.values.size === 0) lines.push(`${this.name} 0`);
    for (const [key, value] of this.values) lines.push(`${this.name}${key ? `{${key}}` : ''} ${value}`);
    return lines.join('\n');
  }
  reset(): void {
    this.values.clear();
  }
}

class Histogram {
  private readonly series = new Map<string, { buckets: number[]; sum: number; count: number }>();
  constructor(
    readonly name: string,
    readonly help: string,
    readonly bounds: readonly number[],
  ) {}
  observe(labels: Labels, seconds: number): void {
    const key = labelKey(labels);
    const entry = this.series.get(key) ?? { buckets: this.bounds.map(() => 0), sum: 0, count: 0 };
    this.bounds.forEach((bound, index) => {
      if (seconds <= bound) entry.buckets[index]! += 1;
    });
    entry.sum += seconds;
    entry.count += 1;
    this.series.set(key, entry);
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [key, entry] of this.series) {
      const prefix = key ? `${key},` : '';
      this.bounds.forEach((bound, index) => lines.push(`${this.name}_bucket{${prefix}le="${bound}"} ${entry.buckets[index]}`));
      lines.push(`${this.name}_bucket{${prefix}le="+Inf"} ${entry.count}`);
      lines.push(`${this.name}_sum${key ? `{${key}}` : ''} ${Number(entry.sum.toFixed(6))}`);
      lines.push(`${this.name}_count${key ? `{${key}}` : ''} ${entry.count}`);
    }
    return lines.join('\n');
  }
  reset(): void {
    this.series.clear();
  }
}

const HTTP_BUCKETS = [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const DB_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5];
const AI_BUCKETS = [0.25, 0.5, 1, 2.5, 5, 10, 20, 40];

export const metrics = {
  httpDuration: new Histogram('crm_http_request_duration_seconds', 'API so‘rovlari davomiyligi (marshrut shabloni bo‘yicha)', HTTP_BUCKETS),
  httpErrors: new Counter('crm_http_errors_total', '5xx javoblar soni'),
  dbDuration: new Histogram('crm_db_query_duration_seconds', 'Ma’lumotlar bazasi so‘rovlari davomiyligi', DB_BUCKETS),
  aiDuration: new Histogram('crm_ai_request_duration_seconds', 'Til modeli so‘rovlari davomiyligi', AI_BUCKETS),
  aiErrors: new Counter('crm_ai_errors_total', 'Til modeli xatolari (timeout, API, sxemaga mos kelmagan javob)'),
  notificationFailures: new Counter('crm_notification_delivery_failures_total', 'Yetkazilmagan bildirishnomalar (oxirgi urinishdan keyin)'),
  telegramFailures: new Counter('crm_telegram_failures_total', 'Telegram API xatolari'),
  jobFailures: new Counter('crm_job_failures_total', 'Fon vazifalari xatolari'),
  /** To'lov webhooklari: provider × natija (ok, duplicate, rejected, unauthorized, error) — TZ 3.1 GAP-17 */
  paymentWebhooks: new Counter('crm_payment_webhooks_total', 'To‘lov provayderi so‘rovlari natijasi bo‘yicha'),
};

/** Scrape paytida hisoblanadigan o'lchagichlar (masalan navbat hajmi) */
const gauges = new Map<string, { help: string; read: () => Promise<Array<{ labels: Labels; value: number }>> }>();

export function registerGauge(name: string, help: string, read: () => Promise<Array<{ labels: Labels; value: number }>>): void {
  gauges.set(name, { help, read });
}

export async function renderMetrics(): Promise<string> {
  const parts: string[] = Object.values(metrics).map((metric) => metric.render());
  const memory = process.memoryUsage();
  parts.push(
    '# HELP crm_process_uptime_seconds Jarayon ishlagan vaqt',
    '# TYPE crm_process_uptime_seconds gauge',
    `crm_process_uptime_seconds ${Math.round(process.uptime())}`,
    '# HELP crm_process_memory_bytes Xotira (rss, heap)',
    '# TYPE crm_process_memory_bytes gauge',
    `crm_process_memory_bytes{type="rss"} ${memory.rss}`,
    `crm_process_memory_bytes{type="heap_used"} ${memory.heapUsed}`,
  );
  for (const [name, gauge] of gauges) {
    parts.push(`# HELP ${name} ${gauge.help}`, `# TYPE ${name} gauge`);
    try {
      for (const row of await gauge.read()) parts.push(`${name}${Object.keys(row.labels).length ? `{${labelKey(row.labels)}}` : ''} ${row.value}`);
    } catch {
      // O'lchagich o'qilmasa (masalan baza yo'q) — metrikalar sahifasi baribir qaytadi
    }
  }
  return `${parts.join('\n')}\n`;
}

/** Testlar uchun */
export function resetMetrics(): void {
  for (const metric of Object.values(metrics)) metric.reset();
}
