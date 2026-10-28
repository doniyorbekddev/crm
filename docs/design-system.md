# Dizayn tizimi

> Academy CRM frontend. Manba: `frontend/src/index.css` (tokenlar), `frontend/src/components/ui/*` (primitivlar).
> Holat: **"Aurora" dizayn tili** (2026-10, ta'lim platformasi bilan bir xil uslub) — PHASE 1–16 redesign ustiga.
> Yangi kod shu qoidalarga amal qiladi. Tekshiruv vositasi: `frontend/scripts/visual` (13-bo'lim).
> Stek: React 19, Tailwind CSS 4 (`@theme`), `lucide-react`. Tashqi UI kutubxonasi yo'q.

## Asosiy qoida

Sahifa va komponentlar **xom qiymat ishlatmaydi** — faqat token:

| Yozmang | Yozing |
|---|---|
| `text-red-600`, `bg-emerald-50`, `dark:bg-red-950` | `text-danger`, `bg-success-subtle` (dark o'zi almashadi) |
| `text-[11px]`, `text-sm font-semibold` (sarlavha) | `text-overline`, `text-h4` |
| `rounded-lg` / `rounded-xl` aralash | `rounded-control`, `rounded-card` |
| `shadow-lg`, `shadow-xl` | `shadow-md` (yoki soyasiz — chegara) |
| `z-50`, `z-[9999]` | `z-modal`, `z-dropdown` |
| `<button><X/></button>` | `<IconButton label="Yopish"><X/></IconButton>` |
| `title="..."` | `<Tooltip content="...">` |

## 0. Identitet: "Aurora"

Premium, tinch va tez (Linear/Vercel uslubi). CRM — ish quroli: **o'qilishi birinchi o'rinda**.

- Sovuq neytral sirtlar, ingichka chegaralar, keng bo'shliq, **bitta binafsha asosiy rang** (`primary` #5b45f0 / dark #a594ff).
- **Brend gradienti** (binafsha → ko'k → feruza, `bg-gradient-brand`) — faqat brend lahzalari: logo, avatar, faol
  indikatorlar (sidebar pill chizig'i, tab chizig'i), login paneli, dashboard hero, bo'sh holat. Oq matn ko'taradigan
  sirtda — `bg-gradient-brand-strong` (har uchida ≥ 5.4:1); yorqin gradient faqat bezak.
- **Aurora nurlari** (`aurora-orb`, `animate-aurora-*`) — xira, sekin (18–26s) suzuvchi doiralar. Faqat login paneli,
  dashboard hero va bo'sh holatlarda. **Jadval, forma va ma'lumot zich joylar orqasida yo'q.**
- **Stage sirtlar** — ikkala mavzuda ham doim to'q: login art paneli, dashboard hero (`PageHeader variant="stage"`).
  Faqat `stage-*` tokenlari (`bg-stage`, `text-stage-fg`, `text-stage-muted`, `border-stage-line`, `bg-stage-glass`,
  `text-stage-accent`, `text-gradient-stage`); xom rang yozilmaydi.
- **Shisha** (`glass`) — yopishqoq panellar: topbar, sidebar, portal paneli, jadvalning yopishqoq sarlavhasi
  (yarim shaffof sirt + `blur(20px) saturate(1.4)`; `backdrop-filter` bo'lmasa — to'liq sirt).
- Ko'tarilgan sirtlarda 1px ichki yorug'lik: `shadow-highlight` (karta, menyu, dialog), rangli sirtda `shadow-on-color`.

## 1. Ranglar

Light va dark qiymatlari `:root` / `.dark` da (`--app-*`), Tailwind klasslari `@theme inline` orqali.
**Dark uchun alohida klass yozilmaydi.**

### Sirt va matn

| Token | Klass | Qo'llanishi |
|---|---|---|
| `bg` | `bg-bg` | Sahifa foni |
| `surface` | `bg-surface` | Karta, jadval, maydon |
| `surface-muted` | `bg-surface-muted` | Jadval sarlavhasi, hover, ikkilamchi blok |
| `surface-elevated` | `bg-surface-elevated` | Suzuvchi qatlam: modal, drawer, menyu (dark'da biroz ochroq) |
| `border` / `border-muted` | `border-border` | Chegara / juda yumshoq ajratgich |
| `fg` | `text-fg` | Asosiy matn |
| `fg-muted` | `text-fg-muted` | Ikkilamchi matn (≥ 4.5:1) |
| `fg-subtle` | `text-fg-subtle` | Uchinchi darajali matn: vaqt, kod, placeholder (≥ 4.5:1) |
| `overlay` | `bg-overlay` | Modal/drawer orqa foni |
| `skeleton` | `bg-skeleton` | Yuklanish to'ldirgichi |
| `focus` | `focus-ring` utilitasi | Klaviatura fokusi halqasi |

### Semantik holatlar

Har biri to'rt qismli: **matn/ikonka** · `-subtle` (fon) · `-border` · `-solid` (oq matnli to'liq fon).
`success` va `danger` da to'liq fonli tugmaning hover holati uchun `-solid-hover` ham bor.

| Ohang | Ma'no | Misol |
|---|---|---|
| `success` | bajarildi, to'landi, faol, keldi | `text-success bg-success-subtle border-success-border`; tugma: `bg-success-solid hover:bg-success-solid-hover` |
| `warning` | kutilmoqda, e'tibor, kechikdi | `text-warning bg-warning-subtle` |
| `danger` | kelmadi, qarz, kritik, xato | `text-danger bg-danger-subtle`; tugma: `bg-danger-solid` |
| `info` | rejalashtirilgan, ma'lumot | `text-info bg-info-subtle` |
| `primary` | brend urg'usi, tanlangan holat | `text-primary bg-primary-subtle` |
| `accent` | toifalash uchun ikkinchi urg'u | `text-accent bg-accent-subtle` |

Brend shkalasi `brand-50…950` — binafsha (`brand-600` = #5b45f0). **Komponentda ishlatilmaydi**: to'liq rangli fon
`bg-primary-solid` / `hover:bg-primary-solid-hover` (oq matn ≥ 4.5:1 ikkala mavzuda), matn `text-primary`, chegara
`border-primary`, halqa `ring-primary/20`. Asosiy tugma — `bg-gradient-primary` (`Button`). Yagona istisno —
sertifikat chop etish (qog'oz).

Aurora qo'shimcha tokenlari: `--app-gradient-{brand,brand-strong,text,primary,progress}`, `--app-glow-primary`
(`shadow-glow`), `--app-surface-glass` (`bg-surface-glass`), `--app-highlight-inset`, `--app-aurora-{1,2,3}`,
`--app-stage-*`, `--app-sheen` (tugma nuri), `--app-shimmer` (skeleton), `--app-shadow-lift` (`shadow-lift`).
**Rang faqat ma'no beradi** — bezak uchun emas; holat faqat rang bilan berilmaydi (matn yoki ikonka ham bo'ladi).

Kontrast: barcha matn tokenlari har qanday sirt va `-subtle` fon ustida ≥ 4.5:1 — **qoida yumshatilmaydi**; o'tmasa
qiymat bir pog'ona to'qroq/ochroq qilinadi (masalan dark `fg-subtle` #868ca3 → #9197ad: rangli `-subtle` fonlarda
4.06 → 4.67:1). Token matritsasi (144 juftlik) va har matn tuguni skaneri: `frontend/scripts/visual` — Aurora
yakunida 36 sahifa (light/dark × 1440/390) bo'yicha past kontrastli matn 0.
Oq matnli to'liq fon uchun `-solid` tokenlar (`bg-danger-solid text-white`); `chart-*` ranglar ustiga matn yozilmaydi.
Grafik legendasi: `formatter={chartLegendFormatter}` — yozuv matn rangida, seriya rangi faqat belgida.

## 2. Tipografiya

Shrift: **Geist** (UI) va **Geist Mono** (`font-mono`: kod, kbd, ID kodlar, vaqt) — o'zgaruvchan, 100–900, lokal:
`src/assets/fonts/` (latin, latin-ext, kirill; OFL — `LICENSE-Geist.txt`). Tashqi CDN yo'q. O'zbekcha `‘` (U+2018)
Geist'da bor; **`ʻ` (U+02BB) Geist'da yo'q** — shu bitta belgi `unicode-range` orqali lokal Inter'dan (fayl faqat sahifada
shu belgi bo'lsa yuklanadi). Glif tekshiruvi: `scanGlyphs` (audit hisobotida).

| Klass | O'lcham / qator | Vazn | Qo'llanishi |
|---|---|---|---|
| `text-display` | 32 / 40 | 600 | Katta raqam, kirish sahifasi |
| `text-h1` | 24 / 32 | 600 | Sahifa sarlavhasi, KPI qiymati |
| `text-h2` | 20 / 28 | 600 | Bo'lim; telefonda sahifa sarlavhasi |
| `text-h3` | 16 / 24 | 600 | Modal/drawer sarlavhasi |
| `text-h4` | 14 / 20 | 600 | Karta sarlavhasi |
| `text-body-lg` | 16 / 24 | — | Urg'uli matn; telefonda maydon matni |
| `text-body` | 14 / 20 | — | Asosiy matn, jadval |
| `text-body-sm` | 13 / 18 | — | Zich joylar |
| `text-caption` | 12 / 16 | — | Izoh, belgi (badge), jadval sarlavhasi |
| `text-label` | 14 / 20 | 500 | Forma yorlig'i |
| `text-overline` | 11 / 16 | 600 | Bo'lim nomi (`uppercase` bilan) |

Vaznni token beradi (`text-h4` ustiga `font-semibold` yozilmaydi). Raqamlar ustunida `tabular-nums`.

## 3. Bo'shliq

Tailwind 4px shkalasi; ishlatiladigan qadamlar: **4, 8, 12, 16, 20, 24, 32, 40, 48, 64**
(`1, 2, 3, 4, 5, 6, 8, 10, 12, 16`). Karta ichi — `p-5`/`p-4`, bloklar orasi — `gap-4`/`gap-6`, forma maydonlari — `space-y-4`.
Ixtiyoriy qiymat (`p-[13px]`) faqat haqiqiy zarurat bilan.

## 4. Radius

| Klass | px | Qo'llanishi |
|---|---|---|
| `rounded-chip` | 6 | Kichik ichki elementlar: yopish tugmasi, kbd, kod, skeleton |
| `rounded-control` | 8 | Tugma, maydon, menyu |
| `rounded-alert` | 12 | Alert, tooltip (grafik) |
| `rounded-card` | 16 | Karta, jadval konteyneri, toast |
| `rounded-dialog` | 24 | Modal, drawer (telefonda yuqori burchaklar) |
| `rounded-pill` | to'liq | Chip, `Badge`, `StatusBadge` |
| `rounded-full` | — | Avatar, nuqta |

`rounded-chip` ataylab to'liq yumaloq emas — u kod bloklari va katta skeletonlarda ham ishlatiladi; "chip" ko'rinishi
`rounded-pill` bilan.

## 5. Soya

`shadow-sm` (tugma), `shadow-md` (suzuvchi qatlam: menyu, modal, drawer, tooltip), `shadow-lift` (faqat bosiladigan
karta hoverida — `lift` utilitasi), `shadow-glow` (asosiy tugma hoverida). Karta asosan chegara bilan, ustida faqat
1px ichki yorug'lik (`shadow-highlight`). Dark'da soyalar o'zi quyuqlashadi.

## 6. Qatlamlar (z-index)

| Klass | Qiymat | Nima |
|---|---|---|
| `z-sticky` | 20 | Yopishqoq jadval sarlavhasi |
| `z-header` | 30 | Yuqori panel |
| `z-overlay` | 40 | Yon menyu orqa foni |
| `z-drawer` | 50 | Drawer, mobil yon menyu |
| `z-modal` | 60 | Modal, tasdiqlash oynasi |
| `z-command` | 65 | Global qidiruv |
| `z-dropdown` | 70 | Menyu, combobox ro'yxati (modal ichida ham ko'rinadi) |
| `z-toast` | 80 | — (sonner o'z qatlamida, eng yuqorida) |
| `z-tooltip` | 90 | Maslahat |

## 7. Harakat

**Tokenlar:** `duration-fast` 140ms (hover, fokus), `duration-normal` 220ms (menyu, tab), `duration-slow` 380ms
(dialog, drawer, pill), `duration-slower` 700ms (progress o'sishi, tugma nuri); `ease-out` (ko'pchilik),
`ease-in-out` (fon siljishi, shimmer), `ease-spring` (menyu, dialog, bosilgan tugma qaytishi).

**Animatsiyalar** (`@theme` da, `fill-mode: backwards`): `fade-in`, `pop-in`, `menu-in`, `dialog-in`,
`slide-in-{right,left,up}`, `rise-in` (sahifa o'tishi, reveal), `grow-x` (progress), `shimmer`, `float`,
`aurora-{1,2,3}`, `live-dot`.

**Qoidalar**
1. Faqat `transform` va `opacity` animatsiya qilinadi. O'lchangan indikatorlar (sidebar pill, tab chizig'i) —
   `translate` + o'tishsiz `width` (`hooks/useActiveIndicator`). Progress — `scaleX` yoki `grow-x`.
2. `animation-fill-mode: backwards` — `both` emas (aks holda hover transformlar ishlamaydi).
3. Sahifa o'tishi: `AppLayout` da `key={pathname}` + `animate-rise-in` (~550ms). Overlay'lar portal orqali `body` da —
   transform ularni siljitmaydi.
4. `MotionEffects` (ildizda bir marta): `data-reveal` / `data-reveal="stagger"` (IntersectionObserver;
   yashirish faqat `html[data-reveal-ready]` dan keyin va faqat ekrandan tashqaridagilarga), MutationObserver,
   `data-spotlight` (`--mx`/`--my`, rAF). Reveal faqat dashboard, direktor paneli va hisobot kartalarida.
5. `CountUp` (StatCard satr qiymatlari): yakuniy qiymat doim bitta haqiqiy matn tugunida (sr-only), sanash — `::after`
   bezagi; tugagach oddiy matn. `parseFormattedNumber` modul darajasida.
6. Fon animatsiyalari ≥ 6s va faqat brend joylarida.
7. `prefers-reduced-motion: reduce`: davomiylik tokenlari 0, global xavfsizlik to'ri (`animation-duration: .01ms`),
   reveal yashirmaydi, CountUp va grafik animatsiyasi (`chartAnimation()`) o'chadi.
8. Animatsiya kiritishni bloklamaydi, fokus tartibini buzmaydi; `:focus-visible` halqasi doim ko'rinadi
   (menyu bandlarida `focus-ring-inset`).

**Nima qilinmaydi**
- Jadval qatorlarida reveal, spotlight yoki katta animatsiya; forma va jadval orqasida aurora.
- `width`/`height`/`top` animatsiyasi; `transition-all`.
- Yangi og'ir kutubxona (framer-motion va h.k.) — CSS va kichik hook'lar yetadi.
- Gradient matn yoki yorqin brend gradienti ustiga oq matn (`gradient-brand-strong` dan tashqari).
- Status faqat rang bilan: doim rang + ikonka/matn. Holat ohangli to'ldirishlar tekis (`chart-*`), gradient emas.

## 8. Komponentlar

Hammasi `@/components/ui/<Nom>` dan. Biznes mantiq yo'q — ma'lumot va hodisalar tashqaridan.

### Mavjud (tokenlarga o'tkazilgan)

`Button` (primary / secondary / ghost / danger; sm, md, lg) · `Input`, `Select`, `Textarea`, `Checkbox`, `PasswordInput`,
`SearchInput`, `FormField` · `Badge` · `Avatar` · `Card` · `Table` · `Pagination` · `Modal` · `ConfirmDialog` · `Alert` ·
`Skeleton` · `EmptyState` · `ErrorState` · `ActionMenu` · `PageHeader` · toast (`sonner`, tokenlar bilan).

### Yangi

| Komponent | Vazifasi |
|---|---|
| `IconButton` | Faqat ikonkali tugma: `label` majburiy, maslahat, `loading`; ghost / secondary / primary / danger |
| `Tooltip` | Hover **va fokus**da; Esc; `aria-describedby` |
| `Tabs`, `TabList`, `Tab`, `TabPanel` | ARIA tablar: ←/→, Home/End, o'chirilgan tab; `underline` / `pill` |
| `Drawer` | Yon panel (o'ng/chap), telefonda pastki panel; fokus tutqichi, Esc |
| `Breadcrumb` | Sahifa yo'li, `aria-current="page"` |
| `StatCard` | KPI: qiymat, o'zgarish (rang ma'nodan), izoh, ikonka, yuklanish, amal |
| `StatusBadge` | Holat belgisi — `utils/statusRegistry.ts` dan |
| `FilterBar`, `FilterField` | Qidiruv + filtrlar; telefonda "Filtrlar" paneli |
| `Timeline` | Voqealar ketma-ketligi |
| `Combobox` | Qidiruvli tanlash (uzun ro'yxat, server qidiruvi) |
| `MultiSelect` | Bir nechta tanlash |
| `CurrencyInput` | Summa: "1 500 000" ko'rinadi, qiymat — son |
| `FileUpload` | Fayl tanlash / tashlash, hajm va tur tekshiruvi |
| `DataTable` | Jadval poydevori: holatlar, saralash, tanlash, ommaviy amallar, zichlik, sahifalash, mobil karta |

### Misollar

```tsx
<IconButton label="Tahrirlash" onClick={edit}><Pencil aria-hidden /></IconButton>

<StatusBadge kind="student" status={student.status} />            // yorliq va rang registrdan

<StatCard title="Qarz" value={formatMoney(debt)} icon={HandCoins} tone="danger"
          trend={{ label: '+8%', direction: 'up', positive: false }} description="o‘tgan oyga nisbatan" />

<Tabs value={tab} onValueChange={setTab}>
  <TabList label="O‘quvchi bo‘limlari">
    <Tab value="overview">Umumiy</Tab>
    <Tab value="payments" count={3}>To‘lovlar</Tab>
  </TabList>
  <TabPanel value="overview">…</TabPanel>
</Tabs>

<Drawer open={open} title="Lead" onClose={close} footer={<Button>Saqlash</Button>}>…</Drawer>

<FilterBar search={{ value: q, onChange: setQ }} activeCount={active} onClear={reset} actions={<ExportMenu … />}>
  <FilterField><Select aria-label="Holat" …/></FilterField>
  <FilterField className="sm:w-56"><MultiSelect label="Guruhlar" …/></FilterField>
</FilterBar>

<DataTable label="O‘quvchilar" columns={columns} rows={data?.items} rowKey={(row) => row.id}
  loading={isPending} error={error} onRetry={refetch}
  empty={{ icon: Users, title: 'O‘quvchilar yo‘q', description: 'Birinchi o‘quvchini qo‘shing' }}
  sort={sort} onSortChange={setSort}
  selection={{ selected, onChange: setSelected, rowLabel: (row) => row.fullName }}
  bulkActions={(keys) => <Button size="sm">Xabar yuborish</Button>}
  rowActions={(row) => [{ label: 'Tahrirlash', icon: Pencil, onSelect: () => edit(row) }]}
  density={density} onDensityChange={setDensity} pagination={…} mobileCard={(row) => <StudentCard row={row} />} />
```

`DataTable` ustunlari — mavjud `ColumnDef` (`utils/tableColumns.ts`) + `sortable`, `align`; `useTableColumns` natijasi
to'g'ridan-to'g'ri beriladi (`visible: false` chizilmaydi). Ma'lumot olish, filtr va saralash **chaqiruvchida**.

### Holatlar registri

`utils/statusRegistry.ts` — 31 holat turi (o'quvchi, lead, to'lov usuli, davomat, vazifa, imtihon, xarajat …). Yorliq va
ohanglar mavjud `utils/*Labels.ts` dan olinadi: **yangi holat o'ylab topilmagan, API qiymatlari o'zgarmagan**.
Noma'lum qiymat — xom matn, neytral ohang. Yangi tur: registrga bitta qator.

`Badge` ohanglari: `neutral · primary · success · warning · danger · info · accent`
(eski `gray · blue · green · yellow · red · purple` nomlari shularga bog'langan va ishlayveradi).

### Sahifa holatlari

Har ro'yxat/sahifada uchta holat: **yuklanish** — `Skeleton`/`TableSkeleton`; **bo'sh** — `EmptyState` (ikonka, sarlavha,
izoh, amal; `size="sm"` — karta ichida); **xato** — `ErrorState` (xabar + "Qayta urinish"). Xom "…topilmadi" matni emas.

### Modal yoki Drawer?

Modal — qisqa forma va tasdiq. Drawer — tezkor ko'rish/tahrir, sahifa konteksti kerak bo'lganda. Murakkab ma'lumot — to'liq sahifa.

## 8.1. Ilova qobig'i (PHASE 2)

| Qism | Qoida |
|---|---|
| **Sidebar** (`layouts/Sidebar.tsx`) | 240px; yig'ilganda 72px (ikonka + maslahat); telefonda drawer (Esc, fon bosilishi). Bandlar ruxsat bo'yicha |
| **Navigatsiya** (`layouts/navigation.ts`) | 8 guruh: Umumiy · Sotuv · O'quv jarayoni · Moliya · Odamlar · Analitika · Avtomatlashtirish · Tizim. Guruh yig'iladi (tanlov saqlanadi); joriy sahifa guruhi doim ochiq. Yangi sahifa — tegishli guruhga bitta qator (`id` barqaror kalit) |
| **Topbar** | 56px, `z-header`: menyu tugmasi, yo'l (`ShellBreadcrumb`), qidiruv, **Yaratish**, filial, bildirishnomalar, til, mavzu, foydalanuvchi |
| **Yaratish** (`QuickCreateMenu`) | Ruxsat etilgan yaratish amallari (lead, o'quvchi, to'lov, xarajat, vazifa) — ro'yxat `components/quickActions.ts` da. Har amal mavjud sahifani `?create=1` bilan ochadi; sahifa `useCreateIntent(open, canCreate)` bilan o'z oynasini ochadi va parametrni olib tashlaydi. Yangi amal — ro'yxatga bitta qator + sahifada hook. Ruxsat yo'q bo'lsa tugma ko'rinmaydi |
| **Yorliqlar** | `Ctrl/Cmd+K` va `/` — qidiruv; `?` — yorliqlar oynasi (`ShortcutsDialog`). Bitta tugmali yorliqlar matn maydonida va boshqa oyna ochiq bo'lganda ishlamaydi |
| **Yo'l** | Menyu tuzilmasidan avtomatik: "Guruh › Sahifa". Ichki sahifada sahifa nomi ro'yxatga havola. Sahifa o'z yo'lini bermoqchi bo'lsa — `PageHeader breadcrumb={<Breadcrumb items={…} />}` |
| **Global qidiruv** | `Ctrl/Cmd+K`; `z-command`; avval **Amallar** (tez yaratish, so'z bo'yicha filtrlanadi), keyin natijalar toifa bo'yicha (soni bilan), ↑/↓/Enter, Esc; fokus oynada, yopilganda qaytadi |
| **Bildirishnomalar** | Qo'ng'iroqcha → `Drawer`: Hammasi / O'qilmagan / Muhim (API filtrlari), "Hammasini o'qish", "Barchasini ko'rish" |
| **Kabinet** (`PortalLayout`) | 56px sarlavha, ostida chiziqli bo'limlar (kompyuter), pastki panel + "Yana" (telefon) |
| **Mavzu** | Kompyuterda yuqori panelda; telefonda foydalanuvchi menyusi ichida |

## 8.2. Grafiklar va KPI (PHASE 3)

- **Grafik ranglari** — `components/charts/chartTheme.ts`: `CHART_COLORS.{brand, positive, negative, warning, accent, neutral}`
  (CSS o'zgaruvchilari — dark'da o'zi almashadi). Seriya rangi ma'no bo'yicha: tushum — `positive`, xarajat — `negative`.
  Komponentda hex yozilmaydi. O'q, to'r, maslahat va ustun uslubi: `CHART_AXIS`, `CHART_GRID`, `CHART_TOOLTIP_STYLE`, `CHART_BAR`.
  To'ldirish chiziqlari uchun klasslar: `bg-chart-brand`, `bg-chart-positive` …
- **KPI** — faqat `StatCard`. Qiymat doim neytral rangda; holat ikonka ohangida (`tone`) va izohda. `to` — karta bo'limiga
  havola; `size="sm"` — zich to'rlar (Dashboard, Direktor paneli). O'zgarish: `trend` (`positive: false` — o'sishi yomon ko'rsatkich).
- **Dashboard tuzilishi**: ko'rsatkichlar yo'nalish bo'yicha guruhlarda (`section` + sarlavha), so'ng grafik va ro'yxatlar.
- **Direktor paneli** (standart tartib): *Diqqat talab qiladi* (doim birinchi; muammo bo'lmasa — yashil "hal qilinmagan muammo
  yo'q" holati) → KPI guruhlari *Moliya / O'quvchilar / Sotuv va resurslar* → *Bugun* + dinamika → sog'lomlik, xulosalar,
  prognoz. Foydalanuvchi o'z tartibini saqlagan bo'lsa, u ustun turadi.
  Har ro'yxat kartasi o'z so'rovini o'zi yuboradi — ruxsatsiz yoki yashirilgan vidjet so'rov yubormaydi.

## 8.3. Ro'yxat sahifasi qolipi (PHASE 4)

```tsx
const table = useTableColumns('students', columns);   // ustun sozlamalari (profilda)
const density = useTableDensity();                    // zichlik (barcha jadvallar uchun bitta, brauzerda)

<DataTable
  label="O‘quvchilar" columns={table.visibleColumns} rows={query.data?.items} rowKey={(row) => row.id}
  loading={query.isPending} error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching}
  stale={query.isPlaceholderData}
  empty={{ icon: GraduationCap, title: 'O‘quvchi topilmadi', description: '…' }}
  header={<Tabs value={status} onValueChange={…} panels={false}><TabList label="Holat bo‘yicha filtr" className="px-4">…</TabList></Tabs>}
  toolbar={<FilterBar search={…} activeCount={n} onClear={…}><FilterField>…</FilterField></FilterBar>}
  toolbarActions={<><Select aria-label="Saralash" …/><ColumnSettings control={table} /></>}
  {...density}
  pagination={…} onRowClick={…} rowClassName={…}
/>
```

- **Holat tablari** — `header` da, `Tabs panels={false}` (sanoq `count`, e'tibor talab qilsa `countTone="danger"`).
- **Filtrlar** — `FilterBar`: qidiruv doim ko'rinadi; boshqalar `FilterField` ichida, telefonda "Filtrlar" paneliga yig'iladi.
  `activeCount` + `onClear` — "Tozalash" tugmasi. Sana maydoniga `caption` (telefonda ko'rinadigan yozuv).
- **Saralash** — API qo'llaydigan tayyor variantlar (`Select`), `toolbarActions` da. Ustun sarlavhasi bo'yicha saralash
  faqat API shunday parametr qabul qilganda (`sortable` + `onSortChange`).
- **Amallar** — `actions` ustunida bitta `ActionMenu`; ko'p ishlatiladigan bitta amal tugma bo'lishi mumkin.
- **Summalar** — ustunda `align: 'right'` (`ColumnDef` va `DataTableColumn`): o'ngga tekislanadi va `tabular-nums` oladi —
  raqamlar xonama-xona ustma-ust turadi.
- **Asosiy ustun** (ism) bir qatorda: `truncate` + `title`, yonidagi nishon `shrink-0` — nishon ismni ikkinchi qatorga surmaydi.
- Sahifa butun oyna bo'yicha aylanadi — yopishqoq sarlavha faqat `maxHeight` berilgan jadvalda (`stickyHeader`).

### Ichki jadval (`DataTable bare`)
Sahifa o'z kartasi, filtrlari, yuklanish/bo'sh/xato holatlarini saqlasa, jadvalning o'zi `<DataTable bare …>` bilan chiziladi:
karta va asboblar qatorisiz, lekin yagona zichlik (foydalanuvchi tanlovi), `stale`, `visible` (ruxsatga bog'liq ustun) va
telefonda `mobileLayout="cards"`. Qolipdagi eski `Table` bloklari `frontend/scripts/migrate-tables.py <fayl>` bilan o'tkaziladi;
qolipga tushmaganini skript o'tkazib yuboradi va sababini aytadi. Matritsa va hisobot jadvallari `Table`da qoladi.

Pul maydoni react-hook-form ichida: `<MoneyController control={control} name="amount" />` (`components/form`) — qiymat raqamlar
satri bo'lib qoladi, sxema o'zgarmaydi.

## 8.4. Tafsilot sahifasi (PHASE 5)

`components/ProfileHeader.tsx` — o'quvchi, o'qituvchi (keyin guruh, lead) sahifalari uchun yagona sarlavha:

```tsx
<ProfileHeader
  back={{ to: '/students', label: 'O‘quvchilar' }}
  firstName={…} lastName={…} title={fullName}                 // title — sahifaning h1
  badges={<StatusBadge kind="student" status={student.status} />}
  meta={[{ name: 'Guruh', icon: Layers, label: group.name }, …]}   // name — ekran o'quvchi uchun
  actions={<>…asosiy tugma, ikkilamchi tugmalar, <ActionMenu trigger={{ label: 'Yana', … }} /></>}
  stats={<><ProfileStat label="Davomat" value="80%" tone="warning" /> …</>}
/>
<Tabs value={tab} onValueChange={setTab}> <TabList label="Profil bo‘limlari"> … </TabList> <TabPanel …/> </Tabs>
```

- Sarlavhada eng ko'pi bitta asosiy (to'ldirilgan) tugma; kam ishlatiladigan amallar "Yana" menyusida.
- Amallar ro'yxat sahifasidagi bilan **bir xil oynalar va ruxsatlar** — tafsilot sahifasi yangi funksiya qo'shmaydi.
- Bo'lim mazmuni alohida fayllarda (`profile/*`); sahifa fayli faqat qobiq.
- **Keyingi qadamlar** (`profile/NextStepsCard.tsx`) — sarlavha ostida, faqat profilda ko'rinib turgan signallardan
  (ketib qolish xavfi, davomat 85% dan past) va mavjud amallardan; ruxsat bo'lmasa qadam chiqmaydi. Sarlavhadagi asosiy
  tugma (masalan, qarzda "To'lov qabul qilish") bu yerda takrorlanmaydi.
- **Xavf kartasi** — 60 balldan past (zaif) omillar ko'rinadi, qolganlari "Barcha omillar (N)" ortida yig'ilgan.

**Ranglarni ko'chirish**: `python3 frontend/scripts/tokenize-colors.py src/pages/<papka>` — xom palitra klasslarini
(`text-red-600 dark:text-red-400` …) semantik tokenlarga almashtiradi. Ishga tushirgach `git diff` ni ko'rib chiqing.

## 8.5. Moliyaviy hisob sahifalari (maosh)

- **Jarayon chizig'i** (`payroll/PayrollOverview.tsx`): holatlar tartib bilan sanoq kartalari; bosilganda ro'yxat filtrlanadi
  (`aria-pressed`). Harakat talab qiladigan bosqich sanog'i `text-warning`.
- **Hisob izohi** (`payroll/CalculationBreakdown.tsx`): har qator — nom, formula (`tabular-nums`), manba izohi va summa;
  oxirida jami va umumiy formula. Hisoblangan raqam izohsiz ko'rsatilmaydi.
- **Yakuniy emas** belgisi: tasdiqlanmagan summa "dastlabki hisob" deb yoziladi; tasdiq oynasida "pul o'tkazmaydi".
- **Ogohlantirishlar** jadvalda ikonka + son (`title` da matn), profilda `Alert tone="warning"` ro'yxati.
- Batafsil qoidalar: `docs/payroll.md`.

## 9. Ikonkalar

Faqat `lucide-react`. O'lchamlar: 16 (`size-4`, standart), 18, 20 (`size-5`), 24. Bezak ikonka — `aria-hidden`.
Emoji interfeys elementi sifatida ishlatilmaydi.

## 10. Accessibility

- **Fokus**: `focus-ring` (2px halqa, `:focus-visible`). `outline-none` faqat teng kuchli ko'rinadigan indikator bilan
  (maydonlar: chegara + halqa; menyu bandi: fon). Fokus indikatori hech qachon olib tashlanmaydi.
- **Nom**: ikonka tugmada `label`; maydonda `FormField` (`htmlFor`) yoki `aria-label`; xato — `aria-describedby={fieldErrorId(id)}`.
- **Dialoglar** (`Modal`, `Drawer`, `ConfirmDialog`): `role="dialog"`, `aria-modal`, sarlavha bilan nomlanadi, fokus
  ichkarida, Esc faqat eng ustki qatlamni yopadi (menyu/combobox ochiq bo'lsa — avval o'sha), yopilganda fokus qaytadi.
- **Klaviatura**: Tabs (←/→/Home/End), ActionMenu (↑/↓/Home/End/Esc), Combobox va MultiSelect (↑/↓/Enter/Esc),
  DataTable saralash (tugma + `aria-sort`), tanlash (`aria-selected`, belgilash kataklari nomlangan).
- Holat faqat rang bilan emas: `StatusBadge icon`, `StatCard` strelkasi, `Alert` ikonkasi.
- **Testlar** elementlarni rol, nom va matn bo'yicha topadi — tugma nomi, label va rolni o'zgartirish ataylab va test bilan.

## 11. Dark mode

Light / Dark / System (`<html class="dark">`). Fon sof qora emas (`#0b1020`), sirtlar neytral; suzuvchi qatlam biroz
ochroq; chegaralar past kontrastli; holat ranglari — to'q `-subtle` fon ustida ochiq matn (yorqin "nur" yo'q).
Yangi rang kerak bo'lsa — `:root` **va** `.dark` ga juft qo'shiladi, kontrast o'lchanadi.

## 12. Responsive

Kengliklar: telefon < 640 (`sm`) · planshet 768 (`md`) · noutbuk 1024 (`lg`) · desktop 1280 (`xl`) · katta 1536 (`2xl`).

- Maydon matni telefonda 16px (iOS kattalashtirib yubormasligi uchun), `sm` dan 14px.
- `Modal`, `Drawer` — telefonda pastdan chiqadi; tugmalar ustma-ust, to'liq kenglikda.
- `FilterBar` — telefonda filtrlar panelga yig'iladi, qidiruv tashqarida qoladi.
- `Tabs` — sig'masa qator gorizontal aylanadi (sahifa emas).
- `DataTable` — `mobileCard` berilsa karta, aks holda jadval konteyner ichida aylanadi; zichlik tugmasi telefonda yashirin.
- Forma — telefonda bir ustun.

## 13. Yakuniy holat va tekshiruvlar (PHASE 16)

| O'lchov | Redesign'dan oldin | Hozir |
|---|---|---|
| Xom palitra klasslari (`text-red-600` …) | 746 | 4 (faqat sertifikat chop etish — qog'oz ranglari) |
| `dark:` klasslari komponentlarda | yuzlab | 0 — hammasi tokenlar orqali |
| Qo'lda yasalgan tablar | 18 fayl | 0 (yagona `Tabs`) |
| Mahalliy KPI kartalari | 12 fayl | `StatCard` (mahalliy o'rovchilar unga uzatadi) |
| Grafiklarda hex rang | 21 | 0 (`chartTheme`) |
| Ixtiyoriy shrift o'lchami `text-[..]` | 19 | 8 |
| Inter shrifti | yuklanmas edi | lokal, 3 to'plam |
| Past kontrastli matn (45 sahifa, 2 mavzu) | 36 tur | 0 |
| Gorizontal siljish (46 sahifa, 390 va 768px) | 2 sahifa | 0 |
| Nomsiz interaktiv element / maydon / jadval (45 sahifa) | 18 jadval | 0 |

**Aurora tekshiruv vositasi (doimiy):** `frontend/scripts/visual` — E2E bilan bir xil izolyatsiyalangan sinov bazasi.

```
npx tsx e2e/prepare.ts
VISUAL_LABEL=after npx playwright test --config frontend/scripts/visual/playwright.visual.config.ts
```

`audit.spec.ts`: token matritsasi, har matn tuguni kontrasti (gradient fon va gradient matn bilan), gorizontal siljish,
konsol xatosi, glif, tarmoq tinchlanishi va skrinshotlar (login, dashboard, o'quvchilar, profil, guruhlar, davomat,
moliya, sozlamalar, portal × light/dark × 1440/390). `interaction.spec.ts`: klaviatura (tab, menyu, drawer, modal,
Esc), reduced-motion, reveal, uzun kadrlar. Natija: `frontend/.visual-audit/<label>/` (git'ga kirmaydi).

**Avtomatik skanerlar** (PHASE 15 — o'sha paytda vaqtinchalik spec bilan; endi yuqoridagi vosita):
kontrast (har matn tuguni, haqiqiy fon bilan), gorizontal siljish (telefon/planshet), a11y (nomsiz tugma/havola/maydon/jadval,
`h1` soni, takror `id`, `main`).

**Hajm** (production build): asosiy JS 125.4 → 126.0 kB gzip, CSS 12.3 → 13.3 kB gzip, barcha JS bo'laklari yig'indisi
748.9 → 766.3 kB gzip (+2.3%: 14 yangi primitiv, 3 yangi sahifa); shrift 152 kB (faqat kerakli to'plam yuklanadi).
Yangi UI kutubxonasi qo'shilmagan.

**Ataylab qoldirilgan**
- Sertifikat chop etish sahifasi — qog'oz uchun qotirilgan ranglar (mavzuga bog'liq emas).
- Ommaviy xabar oldindan ko'rishidagi "📢" — Telegram'ga ketadigan xabarning aynan o'zi.
- Bazadagi daraja/nishon ikonkalari — admin kiritgan ma'lumot (emoji bo'lishi mumkin).
- Sahifa sarlavhasi bo'yicha yopishqoq jadval sarlavhasi — sahifa butun oyna bo'yicha aylanadi.
- Ustun bo'yicha saralash — API faqat tayyor saralash variantlarini qabul qiladi.

**Skriptlar**: `frontend/scripts/tokenize-colors.py` (xom rang → token), `frontend/scripts/migrate-tabs.py` (tablist → `Tabs`).
