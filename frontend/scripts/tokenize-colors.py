"""Xom palitra klasslarini semantik tokenlarga almashtiradi (faqat klass satrlari; mantiqqa tegmaydi)."""
import re, sys, pathlib

TONES = {
    'red': 'danger', 'rose': 'danger',
    'emerald': 'success', 'green': 'success', 'teal': 'success',
    'amber': 'warning', 'yellow': 'warning', 'orange': 'warning',
    'sky': 'info', 'blue': 'info', 'cyan': 'info',
    'violet': 'accent', 'purple': 'accent', 'indigo': 'accent',
}
CHART = {'danger': 'negative', 'success': 'positive', 'warning': 'warning', 'info': 'brand', 'accent': 'accent'}
HUE = '(' + '|'.join(TONES) + ')'
V = r'(?:hover:|group-hover:)?'

def convert(text):
    n = 0
    def rep(pattern, fn):
        nonlocal text, n
        text, k = re.subn(pattern, fn, text)
        n += k
    # matn: light 500–800 (+ dark juftligi)
    rep(rf'\b({V})text-{HUE}-(?:500|600|700|800)(?!\d)(?: dark:(?:hover:)?text-\2-(?:200|300|400)(?!\d))?', lambda m: f'{m.group(1)}text-{TONES[m.group(2)]}')
    # yumshoq fon: 50/100 (+ dark 900/950[/NN])
    rep(rf'\b({V})bg-{HUE}-(?:50|100)(?!\d)(?:/\d+)?(?: dark:(?:hover:)?bg-\2-(?:900|950)(?!\d)(?:/\d+)?)?', lambda m: f'{m.group(1)}bg-{TONES[m.group(2)]}-subtle')
    # chegara / halqa: 200/300 (+ dark 800/900)
    rep(rf'\b({V})(border|ring|divide)-{HUE}-(?:200|300)(?!\d)(?: dark:(?:hover:)?\2-\3-(?:700|800|900)(?!\d)(?:/\d+)?)?', lambda m: f'{m.group(1)}{m.group(2)}-{TONES[m.group(3)]}-border')
    # to'liq fon (chiziq, nuqta): 400–600
    rep(rf'\bbg-{HUE}-(?:400|500|600)(?!\d)(?: dark:bg-\1-(?:400|500)(?!\d))?', lambda m: f'bg-chart-{CHART[TONES[m.group(1)]]}')
    # yetim qolgan dark: variantlari
    rep(rf' dark:(?:hover:)?(?:text|bg|border|ring)-{HUE}-\d{{2,3}}(?:/\d+)?', lambda m: '')
    # brend juftliklari
    rep(r'\b(' + V + r')text-brand-(?:600|700|800)(?: dark:(?:hover:)?text-brand-(?:200|300|400))', lambda m: f'{m.group(1)}text-primary')
    rep(r'\b(' + V + r')bg-brand-(?:50|100)(?!\d)(?:/\d+)? dark:(?:hover:)?bg-brand-(?:900|950)(?:/\d+)?', lambda m: f'{m.group(1)}bg-primary-subtle')
    rep(r'\b(border|ring)-brand-(?:200|300) dark:\1-brand-(?:700|800|900)', lambda m: f'{m.group(1)}-primary-border')
    # brend: juftlik orasida boshqa klasslar bo'lsa (masalan `text-brand-600 hover:underline dark:text-brand-300`) — qator bo'yicha
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if re.search(r'dark:(?:hover:)?text-brand-(?:200|300|400)(?!\d)', line) and re.search(r'(?<![:\w-])text-brand-(?:600|700|800)(?!\d)', line):
            line = re.sub(r'(?<![:\w-])text-brand-(?:600|700|800)(?!\d)', 'text-primary', line)
            line = re.sub(r' dark:(?:hover:)?text-brand-(?:200|300|400)(?!\d)', '', line)
            n += 1
        if re.search(r'dark:bg-brand-(?:900|950)(?!\d)', line) and re.search(r'(?<![:\w-])bg-brand-(?:50|100)(?!\d)', line):
            line = re.sub(r'(?<![:\w-])bg-brand-(?:50|100)(?!\d)(?:/\d+)?', 'bg-primary-subtle', line)
            line = re.sub(r' dark:bg-brand-(?:900|950)(?!\d)(?:/\d+)?', '', line)
            n += 1
        lines[i] = line
    text = '\n'.join(lines)
    # neytral
    rep(r'\bbg-(?:slate|gray|zinc)-(?:100|200)(?!\d)(?:/\d+)?(?: dark:bg-(?:slate|gray|zinc)-(?:700|800)(?:/\d+)?)?', lambda m: 'bg-surface-muted')
    rep(r'\btext-(?:slate|gray|zinc)-(?:500|600|700)(?!\d)(?: dark:text-(?:slate|gray|zinc)-(?:300|400))?', lambda m: 'text-fg-muted')
    rep(r'\bbg-(?:slate|gray|zinc)-950/\d+', lambda m: 'bg-overlay')
    return text, n

assert convert('bg-emerald-500')[0] == 'bg-chart-positive'
assert convert('bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400')[0] == 'bg-danger-subtle text-danger'
assert convert('text-amber-600 dark:text-amber-400')[0] == 'text-warning'
assert convert('border-red-200 bg-red-50')[0] == 'border-danger-border bg-danger-subtle'
assert convert('bg-brand-600 text-white')[0] == 'bg-brand-600 text-white'
assert convert('bg-emerald-950/40')[0] == 'bg-emerald-950/40'
assert convert('a text-brand-600 hover:underline dark:text-brand-300 b')[0] == 'a text-primary hover:underline b'
assert convert('x bg-brand-50 text-fg dark:bg-brand-950')[0] == 'x bg-primary-subtle text-fg'

total = 0
for root in sys.argv[1:]:
    p = pathlib.Path(root)
    files = [p] if p.is_file() else [f for f in p.rglob('*.ts*') if '.test.' not in f.name]
    for f in files:
        src = f.read_text()
        out, n = convert(src)
        if n:
            f.write_text(out)
            total += n
            print(f'{n:4d}  {f}')
print('jami:', total)
