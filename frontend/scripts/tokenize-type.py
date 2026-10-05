"""Xom Tailwind tipografiya va radius klasslarini dizayn tokenlariga o'tkazadi (piksel jihatdan bir xil juftliklar).

  text-xs → text-caption      text-sm → text-body        text-base → text-body-lg
  text-xl + font-semibold → text-h2     text-2xl + font-semibold → text-h1
  text-sm + font-semibold → text-h4     text-sm + font-medium → text-label     text-base + font-semibold → text-h3
  rounded-md → rounded-chip   rounded-lg → rounded-control   rounded-xl → rounded-card   rounded-2xl → rounded-dialog

Qo'sh klasslar faqat bitta satr ichida yonma-yon turganda birlashtiriladi; variantlar (sm:, hover:) saqlanadi.
Ishlatish: python3 scripts/tokenize-type.py src
"""
import pathlib, re, sys

B, E = r'(?<![\w-])', r'(?![\w-])'
STRING = re.compile(r'"[^"\n]*"|\'[^\'\n]*\'|`[^`]*`')
PAIRS = [('text-xl', 'font-semibold', 'text-h2'), ('text-2xl', 'font-semibold', 'text-h1'), ('text-sm', 'font-semibold', 'text-h4'), ('text-sm', 'font-medium', 'text-label'), ('text-base', 'font-semibold', 'text-h3')]
SINGLE = {'text-xs': 'text-caption', 'text-sm': 'text-body', 'text-base': 'text-body-lg'}
RADIUS = {'md': 'chip', 'lg': 'control', 'xl': 'card', '2xl': 'dialog'}

def convert(text):
    tokens = text.split(' ')
    plain = set(tokens)
    for size, weight, token in PAIRS:
        if size in plain and weight in plain:
            tokens = [token if t == size else t for t in tokens if t != weight]
            plain = set(tokens)
    out = []
    for t in tokens:
        prefix, _, name = t.rpartition(':')
        if name in SINGLE:
            name = SINGLE[name]
        else:
            m = re.fullmatch(r'rounded(-[trblse]{1,2})?-(md|lg|xl|2xl)', name)
            if m: name = f"rounded{m.group(1) or ''}-{RADIUS[m.group(2)]}"
        out.append(f'{prefix}:{name}' if prefix else name)
    return ' '.join(out)

def process(src):
    def repl(m):
        s = m.group(0)
        if '${' in s or not re.search(B + r'(text-(xs|sm|base|xl|2xl)|rounded(-[trblse]{1,2})?-(md|lg|xl|2xl))' + E, s):
            return s
        return s[0] + convert(s[1:-1]) + s[-1]
    return STRING.sub(repl, src)

assert process('"text-sm font-semibold text-fg"') == '"text-h4 text-fg"'
assert process("'mt-1 text-xs sm:text-sm rounded-t-lg'") == "'mt-1 text-caption sm:text-body rounded-t-control'"
assert process('"text-smx rounded-lgx prose-text-sm"') == '"text-smx rounded-lgx prose-text-sm"'
assert process('"font-medium text-sm"') == '"text-label"'

if __name__ == '__main__':
    changed = 0
    for root in sys.argv[1:]:
        for f in pathlib.Path(root).rglob('*.tsx'):
            if '.test.' in f.name: continue
            src = f.read_text(); out = process(src)
            if out != src: f.write_text(out); changed += 1
    print(f'{changed} fayl o\'zgardi')
