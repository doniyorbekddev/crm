# Dizayn tizimi

> Academy CRM frontend. Manba: `frontend/src/index.css` (tokenlar), `frontend/src/components/ui/*` (primitivlar).
> Holat: **PHASE 1** (poydevor) — sahifalar keyingi fazalarda shu tizimga ko'chiriladi ([ROADMAP-DESIGN.md](ROADMAP-DESIGN.md)).
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
| `fg-subtle` | `text-fg-subtle` | Placeholder, yordamchi ikonka (≥ 3:1 — asosiy matn uchun emas) |
| `overlay` | `bg-overlay` | Modal/drawer orqa foni |
| `skeleton` | `bg-skeleton` | Yuklanish to'ldirgichi |
| `focus` | `focus-ring` utilitasi | Klaviatura fokusi halqasi |

### Semantik holatlar

Har biri to'rt qismli: **matn/ikonka** · `-subtle` (fon) · `-border` · `-solid` (oq matnli to'liq fon).

| Ohang | Ma'no | Misol |
|---|---|---|
| `success` | bajarildi, to'landi, faol, keldi | `text-success bg-success-subtle border-success-border` |
| `warning` | kutilmoqda, e'tibor, kechikdi | `text-warning bg-warning-subtle` |
| `danger` | kelmadi, qarz, kritik, xato | `text-danger bg-danger-subtle`; tugma: `bg-danger-solid` |
| `info` | rejalashtirilgan, ma'lumot | `text-info bg-info-subtle` |
| `primary` | brend urg'usi, tanlangan holat | `text-primary bg-primary-subtle` |
| `accent` | toifalash uchun ikkinchi urg'u | `text-accent bg-accent-subtle` |

Brend shkalasi `brand-50…950` saqlangan (asosiy tugma: `bg-brand-600`).
**Rang faqat ma'no beradi** — bezak uchun emas; holat faqat rang bilan berilmaydi (matn yoki ikonka ham bo'ladi).

Kontrast (o'lchangan): matn tokenlari sirt va o'z `-subtle` foni ustida light'da 4.8–7.7:1, dark'da 7.5–14.6:1.

## 2. Tipografiya

Shrift: **Inter** (o'zgaruvchan, 100–900), lokal: `src/assets/fonts/` (latin, latin-ext, kirill). Tashqi CDN yo'q.

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
| `rounded-chip` | 6 | Belgi, ikonka tugma, menyu bandi |
| `rounded-control` | 8 | Tugma, maydon, menyu, alert |
| `rounded-card` | 12 | Karta, jadval konteyneri |
| `rounded-dialog` | 16 | Modal, drawer (telefonda yuqori burchaklar) |
| `rounded-full` | — | Avatar, nuqta |

## 5. Soya

Ikki daraja: `shadow-sm` (tugma, bosiladigan sirt) va `shadow-md` (suzuvchi qatlam: menyu, modal, drawer, tooltip).
Karta **soyasiz** — ierarxiya chegara va fon kontrasti bilan. Dark'da soyalar o'zi quyuqlashadi.

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

`duration-fast` 120ms (hover, fokus — standart `transition-*`), `duration-normal` 200ms (menyu, modal),
`duration-slow` 300ms (drawer, yon menyu); `ease-standard`. Animatsiyalar: `animate-fade-in`, `animate-pop-in`,
`animate-slide-in-{right,left,up}`. Faqat maqsadli joyda. `prefers-reduced-motion: reduce` — hammasi o'chadi (global).

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
| **Topbar** | 56px, `z-header`: menyu tugmasi, yo'l (`ShellBreadcrumb`), qidiruv, filial, bildirishnomalar, mavzu, foydalanuvchi |
| **Yo'l** | Menyu tuzilmasidan avtomatik: "Guruh › Sahifa". Ichki sahifada sahifa nomi ro'yxatga havola. Sahifa o'z yo'lini bermoqchi bo'lsa — `PageHeader breadcrumb={<Breadcrumb items={…} />}` |
| **Global qidiruv** | `Ctrl/Cmd+K`; `z-command`; natijalar toifa bo'yicha (soni bilan), ↑/↓/Enter, Esc; fokus oynada, yopilganda qaytadi |
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
- Sahifa butun oyna bo'yicha aylanadi — yopishqoq sarlavha faqat `maxHeight` berilgan jadvalda (`stickyHeader`).

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

**Ranglarni ko'chirish**: `python3 frontend/scripts/tokenize-colors.py src/pages/<papka>` — xom palitra klasslarini
(`text-red-600 dark:text-red-400` …) semantik tokenlarga almashtiradi. Ishga tushirgach `git diff` ni ko'rib chiqing.

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
