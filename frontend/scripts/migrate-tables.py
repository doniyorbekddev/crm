"""Standart qolipdagi <TableContainer><Table><THead>…<TBody>{rows.map(…)}</TBody></Table></TableContainer>
bloklarini <DataTable bare …> ga aylantiradi. Qolipga tushmaganini o'tkazib yuboradi va sababini aytadi."""
import re, sys, pathlib

def strip_tags(text):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>|\{[^}]*\}', ' ', text)).strip()

def parse_attrs(tag_open):
    """<TD className="x" onClick=...> → dict; faqat className / onClick stopPropagation qo'llanadi"""
    inner = re.sub(r'^<\w+', '', tag_open).rstrip('>').strip()
    attrs = {}
    rest = inner
    while rest:
        m = re.match(r'(\w[\w-]*)=("([^"]*)"|\{)', rest)
        if not m:
            return None
        name = m.group(1)
        if m.group(2).startswith('"'):
            attrs[name] = ('str', m.group(3)); rest = rest[m.end():].strip()
        else:
            depth, i = 0, m.end() - 1
            while i < len(rest):
                if rest[i] == '{': depth += 1
                elif rest[i] == '}':
                    depth -= 1
                    if depth == 0: break
                i += 1
            attrs[name] = ('expr', rest[m.end():i]); rest = rest[i + 1:].strip()
    return attrs

def split_cells(lines, indent, tag):
    """Berilgan chekinishdagi <TAG …>…</TAG> bloklari (bir yoki ko'p qatorli)"""
    cells, i = [], 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1; continue
        after = line[len(indent) + len(tag) + 1:len(indent) + len(tag) + 2]
        if not line.startswith(indent + f'<{tag}') or after not in ('', ' ', '>'):
            return None
        if line.rstrip().endswith(f'</{tag}>') or line.rstrip().endswith('/>'):
            cells.append([line]); i += 1; continue
        j = i + 1
        while j < len(lines) and lines[j].rstrip() != indent + f'</{tag}>':
            j += 1
        if j >= len(lines): return None
        cells.append(lines[i:j + 1]); i = j + 1
    return cells

def cell_parts(block, tag):
    text = '\n'.join(block)
    m = re.match(r'\s*(<' + tag + r'\b[^>]*?(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^>]*?)*>)(.*)</' + tag + r'>\s*$', text, re.S)
    if not m:
        m2 = re.match(r'\s*(<' + tag + r'\b.*?)/>\s*$', text, re.S)
        if m2: return m2.group(1) + '>', ''
        return None
    return m.group(1), m.group(2)

def unwrap_conditionals(text, indent, tag):
    """{shart && (<TAG …>…</TAG>)} → <TAG __visible={shart} …>…</TAG> (ustunning `visible` xossasi bo'ladi)"""
    def multi(m):
        body = '\n'.join(l[2:] if l.startswith(indent + '  ') else l for l in m.group('body').split('\n'))
        return re.sub(r'^(\s*<' + tag + r')', lambda t: t.group(1) + ' __visible={' + m.group('cond') + '}', body, count=1) + '\n'
    text = re.sub(r'^' + re.escape(indent) + r'\{(?P<cond>[\w.!]+) && \(\n(?P<body>.*?)\n' + re.escape(indent) + r'\)\}\n', multi, text, flags=re.S | re.M)
    text = re.sub(r'^' + re.escape(indent) + r'\{(?P<cond>[\w.!]+) && <' + tag + r'(?P<rest>[^\n]*)\}\n',
                  lambda m: f"{indent}<{tag} __visible={{{m.group('cond')}}}{m.group('rest')}\n", text, flags=re.M)
    return text

BLOCK = re.compile(
    r'(?P<i>[ \t]*)<TableContainer(?P<tc>[^>]*)>\n'
    r'(?P=i)  <Table(?P<ta>[^>]*)>\n'
    r'(?P=i)    <THead>\n'
    r'(?P=i)      <(?:tr|TR)>\n'
    r'(?P<th>.*?)'
    r'(?P=i)      </(?:tr|TR)>\n'
    r'(?P=i)    </THead>\n'
    r'(?P=i)    <TBody>\n'
    r'(?P=i)      \{(?P<rows>[^\n]+?)\.map\(\((?P<var>\w+)\) => \(\n'
    r'(?P<tr>(?P=i)        <TR\b.*?)'
    r'(?P=i)        </TR>\n'
    r'(?P=i)      \)\)\}\n'
    r'(?P=i)    </TBody>\n'
    r'(?P=i)  </Table>\n'
    r'(?P=i)</TableContainer>\n', re.S)

def convert(src, fallback_label):
    notes = []
    def repl(m):
        I, var = m.group('i'), m.group('var')
        ths = split_cells(unwrap_conditionals(m.group('th'), I + '        ', 'TH').rstrip('\n').split('\n'), I + '        ', 'TH')
        tr_text = m.group('tr')
        # <TR …> ochilishi (bir yoki ko'p qatorli) va ichidagi TD lar
        trm = re.match(r'(?P<open>' + re.escape(I) + r'        <TR\b(?:[^>{}]|\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})*>)\n(?P<body>.*)$', tr_text, re.S)
        if not ths or not trm: notes.append('TH/TR qolipi'); return m.group(0)
        tds = split_cells(unwrap_conditionals(trm.group('body'), I + '          ', 'TD').rstrip('\n').split('\n'), I + '          ', 'TD')
        if not tds or len(tds) != len(ths): notes.append(f'TD soni ({len(tds) if tds else "?"} ≠ {len(ths)})'); return m.group(0)
        tr_attrs = parse_attrs(re.sub(r'\s+', ' ', trm.group('open').strip()))
        if tr_attrs is None or 'key' not in tr_attrs or set(tr_attrs) - {'key', 'className', 'onClick'}: notes.append('TR atributlari'); return m.group(0)
        if tr_attrs['key'][0] != 'expr': notes.append('TR key'); return m.group(0)
        table_attrs = parse_attrs('<Table' + m.group('ta') + '>')
        tc_attrs = parse_attrs('<TableContainer' + m.group('tc') + '>')
        if table_attrs is None or tc_attrs is None or set(table_attrs) - {'aria-label'} or set(tc_attrs) - {'className'}: notes.append('Table atributlari'); return m.group(0)
        label = table_attrs.get('aria-label', ('str', fallback_label))[1]
        cols = []
        for index, (th, td) in enumerate(zip(ths, tds)):
            thp, tdp = cell_parts(th, 'TH'), cell_parts(td, 'TD')
            if not thp or not tdp: notes.append('katak ajratilmadi'); return m.group(0)
            tha, tda = parse_attrs(re.sub(r'\s+', ' ', thp[0].strip())), parse_attrs(re.sub(r'\s+', ' ', tdp[0].strip()))
            if tha is None or tda is None or set(tha) - {'className', '__visible'} or set(tda) - {'className', 'onClick', '__visible'}: notes.append('katak atributlari'); return m.group(0)
            if 'onClick' in tda and 'stopPropagation' not in tda['onClick'][1]: notes.append('TD onClick'); return m.group(0)
            head = thp[1].strip()
            plain = not re.search(r'[<{]', head)
            text = strip_tags(head)
            fixed = (not text) or 'sr-only' in head
            parts = [f"key: 'c{index}'", "label: " + repr(text or 'Amallar').replace('"', "'") if "'" not in (text or 'Amallar') else f'label: "{text}"']
            if not plain and head and not fixed: parts.append(f'header: <>{head}</>')
            if fixed:
                parts.append("header: <span className=\"sr-only\">" + (text or 'Amallar') + "</span>"); parts.append('fixed: true')
            if 'className' in tha:
                parts.append(f"thClassName: '{tha['className'][1]}'" if tha['className'][0] == 'str' else None) if tha['className'][0] == 'str' else notes.append('TH className ifoda')
                if tha['className'][0] != 'str': return m.group(0)
            if 'className' in tda:
                parts.append(f"tdClassName: '{tda['className'][1]}'" if tda['className'][0] == 'str' else f"tdClassName: ({var}) => {tda['className'][1]}")
            if 'onClick' in tda: parts.append('stopRowClick: true')
            if '__visible' in tha: parts.append(f"visible: {tha['__visible'][1]}")
            body = tdp[1].strip('\n')
            if '\n' in body or len(body.strip()) > 90:
                inner = '\n'.join((I + '          ' + l[len(I) + 12:] if l.startswith(I + '            ') else I + '          ' + l.strip()) for l in body.split('\n') if l.strip())
                cell = f"cell: ({var}) => (\n{I}        <>\n{inner}\n{I}        </>\n{I}      )"
            else:
                cell = f"cell: ({var}) => <>{body.strip()}</>"
            parts = [p for p in parts if p]
            cols.append(I + '    {\n' + ''.join(f"{I}      {p},\n" for p in parts) + f"{I}      {cell},\n{I}    }},")
        out = [f'{I}<DataTable', f'{I}  bare', f'{I}  label="{label}"', f'{I}  rows={{{m.group("rows")}}}', f'{I}  rowKey={{({var}) => {tr_attrs["key"][1]}}}']
        if 'className' in tr_attrs:
            out.append(f"{I}  rowClassName={{() => '{tr_attrs['className'][1]}'}}" if tr_attrs['className'][0] == 'str' else f"{I}  rowClassName={{({var}) => {tr_attrs['className'][1]}}}")
        if 'onClick' in tr_attrs:
            fn = tr_attrs['onClick'][1].strip()
            fm = re.match(r'\(\)\s*=>\s*(.*)$', fn, re.S)
            if not fm: notes.append('TR onClick'); return m.group(0)
            out.append(f"{I}  onRowClick={{({var}) => {fm.group(1)}}}")
        if 'className' in tc_attrs:
            if tc_attrs['className'][0] == 'expr' and 'isPlaceholderData' in tc_attrs['className'][1]:
                pm = re.search(r'(\w+(?:\.\w+)*\.isPlaceholderData)', tc_attrs['className'][1])
                out.append(f"{I}  stale={{{pm.group(1)}}}")
            elif tc_attrs['className'][0] == 'str':
                out.append(f"{I}  className=\"{tc_attrs['className'][1]}\"")
            else:
                notes.append('TableContainer className'); return m.group(0)
        out.append(f'{I}  mobileLayout="cards"')
        out.append(f'{I}  columns={{[')
        out.extend(cols)
        out.append(f'{I}  ]}}')
        out.append(f'{I}/>')
        notes.append('OK')
        return '\n'.join(out) + '\n'
    out = BLOCK.sub(repl, src)
    return out, notes

for arg in sys.argv[1:]:
    f = pathlib.Path(arg)
    src = f.read_text()
    if '<TableContainer' not in src:
        continue
    out, notes = convert(src, f.stem)
    ok = notes.count('OK')
    if ok:
        if "from '@/components/ui/DataTable'" not in out:
            mm = re.search(r"^import .*;\n", out, re.M)
            out = out[:mm.start()] + "import { DataTable } from '@/components/ui/DataTable';\n" + out[mm.start():]
        f.write_text(out)
    skipped = [n for n in notes if n != 'OK']
    print(f"{ok} ok  {len(skipped)} skip  {arg}  {'; '.join(skipped) if skipped else ''}" if notes else f"-  no match  {arg}")
