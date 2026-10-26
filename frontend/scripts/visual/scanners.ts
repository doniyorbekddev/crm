/**
 * Brauzer ichida ishlaydigan skanerlar (`page.evaluate` ga beriladi — o'z-o'zini ta'minlaydi, tashqi import yo'q).
 */

export interface ContrastIssue {
  text: string;
  selector: string;
  fg: string;
  bg: string;
  ratio: number;
  required: number;
}

export interface TokenPairResult {
  fg: string;
  bg: string;
  ratio: number;
  required: number;
}

/**
 * Har matn tuguni: matn rangi va haqiqiy foni (shaffof qatlamlar ustma-ust, gradientda — eng yomon to'xtash nuqtasi;
 * `background-clip: text` gradient matn — har bir rang). Ochiq-oydin istisnolar: o'chirilgan boshqaruv elementi,
 * ko'rinmas yoki `sr-only` matn, rasm fonli joy.
 */
export function scanContrast(): ContrastIssue[] {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  type Rgba = [number, number, number, number];

  const parse = (color: string): Rgba => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r!, g!, b!, a! / 255];
  };
  const over = (top: Rgba, bottom: Rgba): Rgba => {
    const a = top[3];
    return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1];
  };
  const lum = ([r, g, b]: Rgba) => {
    const f = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a: Rgba, b: Rgba) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x! + 0.05) / (y! + 0.05);
  };
  const hex = (c: Rgba) => `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const stops = (image: string): string[] =>
    image.includes('gradient') ? (image.match(/(rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\)|oklch\([^)]*\)|#[0-9a-fA-F]{3,8}\b)/g) ?? []) : [];

  /** Element fonidagi mumkin bo'lgan ranglar (gradient bo'lsa — bir nechta) */
  const backgrounds = (start: Element | null): Rgba[] | null => {
    const chain: Element[] = [];
    for (let node: Element | null = start; node; node = node.parentElement) chain.push(node);
    let candidates: Rgba[] = [[255, 255, 255, 1]];
    for (const node of chain.reverse()) {
      const style = getComputedStyle(node);
      if (style.backgroundImage.includes('url(')) return null;
      const color = parse(style.backgroundColor);
      if (color[3] > 0) candidates = candidates.map((base) => over(color, base));
      const gradient = stops(style.backgroundImage);
      if (gradient.length > 0 && style.backgroundClip !== 'text' && !style.getPropertyValue('-webkit-background-clip').includes('text')) {
        candidates = candidates.flatMap((base) => gradient.map((stop) => over(parse(stop), base)));
      }
    }
    return candidates;
  };

  const issues: ContrastIssue[] = [];
  const seen = new Set<string>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim();
    const el = node.parentElement;
    if (!text || !el) continue;
    if (el.closest('svg, option, script, style, [data-contrast-ignore]')) continue;
    if (el.closest(':disabled, [aria-disabled="true"], [inert]')) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    let opacity = 1;
    for (let up: Element | null = el; up; up = up.parentElement) opacity *= Number(getComputedStyle(up).opacity);
    if (opacity < 0.05) continue;

    const clipText = style.backgroundClip === 'text' || style.getPropertyValue('-webkit-background-clip').includes('text');
    const fgColors = clipText ? stops(style.backgroundImage).map(parse) : [parse(style.color)];
    const bgColors = backgrounds(clipText ? el.parentElement : el);
    if (!bgColors || fgColors.length === 0) continue;

    const size = parseFloat(style.fontSize);
    const bold = Number(style.fontWeight) >= 700;
    const required = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    let worst = { ratio: Infinity, fg: fgColors[0]!, bg: bgColors[0]! };
    for (const fg of fgColors) {
      for (const bg of bgColors) {
        const effective = over([fg[0], fg[1], fg[2], fg[3] * opacity], bg);
        const value = ratio(effective, bg);
        if (value < worst.ratio) worst = { ratio: value, fg: effective, bg };
      }
    }
    if (worst.ratio + 0.005 < required) {
      const selector = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${[...el.classList].slice(0, 4).join('.')}`;
      const key = `${hex(worst.fg)}|${hex(worst.bg)}|${selector}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({ text: text.slice(0, 60), selector, fg: hex(worst.fg), bg: hex(worst.bg), ratio: Math.round(worst.ratio * 100) / 100, required });
    }
  }
  return issues;
}

/**
 * Token matritsasi: har bir matn tokeni har bir sirt va `-subtle` fon ustida; holat matni o'z `-subtle` foni ustida;
 * oq matn `-solid` va asosiy tugma gradienti ustida; stage matni stage foni ustida. Talab — 4.5:1.
 */
export function scanTokens(): TokenPairResult[] {
  const root = getComputedStyle(document.documentElement);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  type Rgba = [number, number, number, number];
  const parse = (color: string): Rgba => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r!, g!, b!, a! / 255];
  };
  const over = (top: Rgba, bottom: Rgba): Rgba => {
    const a = top[3];
    return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1];
  };
  const lum = ([r, g, b]: Rgba) => {
    const f = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a: Rgba, b: Rgba) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x! + 0.05) / (y! + 0.05);
  };
  const token = (name: string) => root.getPropertyValue(name).trim();
  const solid = (name: string): Rgba => over(parse(token(name)), parse(token('--app-surface')));
  const results: TokenPairResult[] = [];
  const check = (fg: string, bg: string, fgColor: Rgba, bgColor: Rgba) => {
    results.push({ fg, bg, ratio: Math.round(ratio(over(fgColor, bgColor), bgColor) * 100) / 100, required: 4.5 });
  };

  const surfaces = ['--app-bg', '--app-surface', '--app-surface-muted', '--app-surface-elevated'];
  const tones = ['success', 'warning', 'danger', 'info', 'primary', 'accent'];
  const subtle = tones.map((tone) => `--app-${tone}-subtle`);
  for (const fg of ['--app-fg', '--app-fg-muted', '--app-fg-subtle']) {
    for (const bg of [...surfaces, ...subtle]) check(fg, bg, parse(token(fg)), solid(bg));
  }
  for (const tone of tones) {
    for (const bg of [...surfaces, `--app-${tone}-subtle`]) check(`--app-${tone}`, bg, parse(token(`--app-${tone}`)), solid(bg));
  }
  for (const tone of ['success', 'danger', 'warning', 'info']) {
    const name = `--app-${tone}-solid`;
    if (token(name)) check('#ffffff', name, [255, 255, 255, 1], parse(token(name)));
  }
  // Asosiy tugma gradienti: oq matn har ikki uchida
  const gradient = token('--app-gradient-primary');
  for (const stop of gradient.match(/(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b)/g) ?? []) check('#ffffff', `--app-gradient-primary ${stop}`, [255, 255, 255, 1], parse(stop));
  if (token('--app-stage-bg')) {
    for (const fg of ['--app-stage-fg', '--app-stage-muted', '--app-stage-accent']) check(fg, '--app-stage-bg', parse(token(fg)), parse(token('--app-stage-bg')));
  }
  return results;
}

/**
 * Glif Geist'ning o'zida bormi: belgi `Geist, monospace` va faqat `monospace` bilan o'lchanadi —
 * Geist'da glif bo'lmasa brauzer fallback'ga o'tadi va kengliklar teng chiqadi.
 */
export async function scanGlyphs(): Promise<Array<{ char: string; code: string; family: string; inFont: boolean }>> {
  const chars = ['‘', 'ʻ', 'ʼ', '’', 'ў', 'қ', 'ғ', 'ҳ', 'Ж'];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const result: Array<{ char: string; code: string; family: string; inFont: boolean }> = [];
  for (const family of ['Geist', 'Geist Mono']) {
    await document.fonts.load(`32px "${family}"`, chars.join(''));
    for (const char of chars) {
      ctx.font = `32px "${family}", monospace`;
      const withFont = ctx.measureText(char.repeat(8)).width;
      ctx.font = '32px monospace';
      const fallback = ctx.measureText(char.repeat(8)).width;
      result.push({ char, code: `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`, family, inFont: Math.abs(withFont - fallback) > 0.5 });
    }
  }
  return result;
}
