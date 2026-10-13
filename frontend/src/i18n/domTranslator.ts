import type { Translate } from './translate';

/**
 * Tarjimani sahifaga qo'llaydi: matn tugunlari va ko'rinadigan atributlar (placeholder, title, aria-label, alt).
 *
 * Nega DOM darajasida: ilova matnlari 290 ga yaqin komponentda to'g'ridan-to'g'ri yozilgan. Har birini kalitga
 * almashtirish — butun ilovani qayta yozish. Bu qatlam esa mavjud kodga tegmaydi va standart tilda (o'zbekcha)
 * umuman ishlamaydi — o'rnatilmaydi ham.
 *
 * React bilan muvofiqlik: faqat matn tugunining QIYMATI o'zgartiriladi, tugunlar qo'shilmaydi/olib tashlanmaydi/
 * o'ralmaydi (brauzer tarjimonlari React'ni aynan tuzilmani o'zgartirgani uchun buzadi). React matnni yangilaganda
 * o'zi yangi qiymat yozadi — kuzatuvchi uni ko'rib, qayta tarjima qiladi.
 */
const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'] as const;
/** Tarjima qilinmaydigan joylar: kod, foydalanuvchi kiritayotgan matn va ataylab belgilanganlar */
const SKIP_SELECTOR = 'script, style, noscript, code, pre, kbd, textarea, [contenteditable="true"], [data-no-translate], .cm-editor';

interface Entry {
  source: string;
  output: string;
}

let translate: Translate | null = null;
let observer: MutationObserver | null = null;
let textEntries = new WeakMap<Text, Entry>();
let attributeEntries = new WeakMap<Element, Map<string, Entry>>();
/** Tarjima qilingan tugunlar — tilni almashtirish yoki o'chirishda asl matnni qaytarish uchun */
const touchedText = new Set<WeakRef<Text>>();
const touchedElements = new Set<WeakRef<Element>>();

function skipped(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element === null || element.closest(SKIP_SELECTOR) !== null;
}

function applyText(node: Text): void {
  if (!translate) return;
  const current = node.nodeValue ?? '';
  const entry = textEntries.get(node);
  // O'zimiz yozgan qiymat — qayta ishlanmaydi (kuzatuvchi o'z o'zgarishini ham ko'radi)
  if (entry && entry.output === current) return;
  if (skipped(node)) return;
  const output = translate(current);
  if (!entry) touchedText.add(new WeakRef(node));
  textEntries.set(node, { source: current, output });
  if (output !== current) node.nodeValue = output;
}

function applyAttributes(element: Element): void {
  if (!translate || skipped(element)) return;
  for (const name of ATTRIBUTES) {
    const current = element.getAttribute(name);
    if (current === null || current === '') continue;
    let entries = attributeEntries.get(element);
    const entry = entries?.get(name);
    if (entry && entry.output === current) continue;
    const output = translate(current);
    if (!entries) {
      entries = new Map();
      attributeEntries.set(element, entries);
      touchedElements.add(new WeakRef(element));
    }
    entries.set(name, { source: current, output });
    if (output !== current) element.setAttribute(name, output);
  }
}

function applyTree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    applyText(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  applyAttributes(root as Element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) applyText(node as Text);
    else applyAttributes(node as Element);
  }
}

/** Barcha tarjima qilingan joylarga asl (o'zbekcha) matnni qaytaradi */
function restore(): void {
  for (const ref of touchedText) {
    const node = ref.deref();
    const entry = node ? textEntries.get(node) : undefined;
    if (node && entry && node.nodeValue === entry.output) node.nodeValue = entry.source;
  }
  for (const ref of touchedElements) {
    const element = ref.deref();
    const entries = element ? attributeEntries.get(element) : undefined;
    if (!element || !entries) continue;
    for (const [name, entry] of entries) {
      if (element.getAttribute(name) === entry.output) element.setAttribute(name, entry.source);
    }
  }
  touchedText.clear();
  touchedElements.clear();
  textEntries = new WeakMap();
  attributeEntries = new WeakMap();
}

/**
 * Sahifa tarjimasini o'rnatadi (`null` — o'chiradi va asl matnni qaytaradi).
 * Avvalgi til izlari to'liq qaytariladi, so'ng yangi til qo'llanadi — tillar orasida to'g'ridan-to'g'ri o'tish mumkin.
 */
export function setDomTranslator(next: Translate | null): void {
  observer?.disconnect();
  observer = null;
  restore();
  translate = next;
  if (!next) return;

  applyTree(document.documentElement);
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') applyText(mutation.target as Text);
      else if (mutation.type === 'attributes') applyAttributes(mutation.target as Element);
      else for (const node of mutation.addedNodes) applyTree(node);
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRIBUTES] });
}
