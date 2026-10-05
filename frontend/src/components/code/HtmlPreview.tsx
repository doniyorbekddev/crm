/**
 * HTML/CSS javobni ko'rish (TZ 3.1 GAP-19) — **serverda bajarilmaydi**, ko'ruvchining brauzerida izolyatsiyada:
 *  - `sandbox="allow-scripts"` — `allow-same-origin` YO'Q: sahifa alohida "opaque" manba, CRM cookie, token va
 *    DOM'iga kira olmaydi; forma, popup, yuqori oynani boshqarish ham yo'q;
 *  - CSP `default-src 'none'` — tarmoq so'rovi yo'q (rasm/skript/fetch tashqaridan yuklanmaydi).
 */
const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:";

export function buildPreviewDocument(code: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"></head><body>${code}</body></html>`;
}

export function HtmlPreview({ code, title = 'HTML ko‘rinishi' }: { code: string; title?: string }) {
  return (
    <section className="space-y-1">
      <p className="text-caption font-medium text-fg-muted">{title} (izolyatsiyada, internetsiz)</p>
      <iframe title={title} sandbox="allow-scripts" srcDoc={buildPreviewDocument(code)} className="h-72 w-full rounded-control border border-border bg-white" referrerPolicy="no-referrer" />
    </section>
  );
}
