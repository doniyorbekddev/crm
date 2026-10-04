"""Qo'lda yasalgan `role="tablist"` bloklarini yagona <Tabs> primitiviga o'tkazadi (nom va rollar o'zgarmaydi)."""
import re, sys, pathlib

BLOCK = re.compile(
    r'(?P<indent>[ \t]*)<div role="tablist" aria-label="(?P<label>[^"]+)" className="(?P<cls>[^"]*)">\n'
    r'\s*\{(?P<list>[\w.]+)\.map\(\((?P<var>\w+)\) => \{\n'
    r'(?P<body>.*?)'
    r'\n\s*\}\)\}\n(?P=indent)</div>\n',
    re.S,
)

def convert(src, variant):
    count = 0
    def repl(m):
        nonlocal count
        body, var, indent = m.group('body'), m.group('var'), m.group('indent')
        state = re.search(r'const active = (\w+) === ' + var + r'(?:\.value)?;', body)
        setter = re.search(r'onClick=\{\(\) => (.+?)\}\n', body, re.S)
        if not state or not setter or 'role="tab"' not in body:
            return m.group(0)
        value = f'{var}.value' if f'{var}.value' in body else var
        call = setter.group(1).strip()
        has_icon = 'const Icon = ' in body
        # tab mazmuni: <button ...> va </button> orasidagi qism
        inner = re.search(r'<button\b.*?>\n(?P<inner>.*?)\n\s*</button>', body, re.S)
        if not inner:
            return m.group(0)
        content = inner.group('inner')
        content = re.sub(r'\s*<Icon className="[^"]*" aria-hidden />\n', '\n', '\n' + content).strip('\n')
        lines = [l.strip() for l in content.split('\n') if l.strip()]
        if any('<span' in l or '&&' in l for l in lines):
            return m.group(0)   # sanoqli tablar — qo'lda
        text = ' '.join(lines)
        handler = call.replace(f'{value}', 'value as typeof ' + state.group(1)) if value in call else None
        if handler is None:
            return m.group(0)
        count += 1
        icon = f' icon={{<{var}.icon className="size-4" aria-hidden />}}' if has_icon else ''
        mb = ' className="mb-4"' if 'mb-4' in m.group('cls') and variant == 'underline' else ''
        wrap_open = f'{indent}<Tabs value={{{state.group(1)}}} onValueChange={{(value) => {handler}}}' + (' variant="pill"' if variant == 'pill' else '') + ' panels={false}>\n'
        return (wrap_open +
                f'{indent}  <TabList label="{m.group("label")}"{mb}>\n'
                f'{indent}    {{{m.group("list")}.map(({var}) => (\n'
                f'{indent}      <Tab key={{{value}}} value={{{value}}}{icon}>\n'
                f'{indent}        {text}\n'
                f'{indent}      </Tab>\n'
                f'{indent}    ))}}\n'
                f'{indent}  </TabList>\n'
                f'{indent}</Tabs>\n')
    out = BLOCK.sub(repl, src)
    return out, count

for arg in sys.argv[1:]:
    variant = 'underline'
    path = arg
    if ':' in arg:
        path, variant = arg.split(':')
    f = pathlib.Path(path)
    src = f.read_text()
    out, n = convert(src, variant)
    if n:
        if "from '@/components/ui/Tabs'" not in out:
            m = re.search(r"^import .*;\n", out, re.M)
            out = out[:m.start()] + "import { Tab, TabList, Tabs } from '@/components/ui/Tabs';\n" + out[m.start():]
        f.write_text(out)
    print(f'{n}  {path}')
