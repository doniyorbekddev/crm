# DESIGN AUDIT REPORT

> Sana: 2026-10-04. Manba: `dizayn.md` §3, §46. Tekshiruv `frontend/src` source code bo'yicha — sonlar `grep` bilan
> o'lchangan. **Hech qanday kod o'zgartirilmadi.** Reja: [ROADMAP-DESIGN.md](ROADMAP-DESIGN.md).

## 1. Current architecture

- React 19 + Vite 8 + Tailwind CSS 4 (`@theme`, konfiguratsiya fayli yo'q — tokenlar `src/index.css` da), React Router 7
  (74 marshrut, hammasi `lazy`), TanStack Query, react-hook-form + zod, `lucide-react` (yagona ikonka kutubxonasi),
  `recharts` (9 fayl), `@dnd-kit` (kanban, vidjetlar), `sonner` (toast).
- Hajm: ~52 000 qator; **185 sahifa fayli**, 47 komponent (24 tasi `components/ui`), 43 sahifa papkasi.
- Ikki qobiq: xodimlar — `AppLayout` (Sidebar + Topbar), kabinet — `PortalLayout` (o'quvchi/ota-ona, 22 sahifa).
- Eng katta fayllar: `ExecutivePage` 671, `StudentsPage` 566, `DashboardPage` 536, `DiscountsPage` 465, `MoneyPage` 461
  qator. 2000 qatorli "mega-komponent" yo'q, lekin 400+ qatorli 15 ga yaqin sahifa bor.

## 2. Current design system

Asos bor va sog'lom — noldan qurish shart emas:

| Narsa | Holat |
|---|---|
| Semantik sirt tokenlari | `bg`, `surface`, `surface-muted`, `border`, `fg`, `fg-muted`, `fg-subtle` — light va dark (`.dark`) |
| Brend rangi | `brand-50…950` (ko'k/indigo) |
| Dark mode | Bor (Light / Dark / System), tokenlar orqali; fon sof qora emas |
| UI primitivlari | Button, Input, Select, Textarea, Checkbox, PasswordInput, SearchInput, FormField, Badge, Avatar, Card, Table, ColumnTable, Pagination, Modal (mobil'da bottom sheet), ConfirmDialog, ActionMenu, Alert, Skeleton, EmptyState, ErrorState |
| Qobiq | Sidebar yig'iladi (72px), mobil'da drawer; Topbar; `Ctrl/Cmd+K` global qidiruv; bildirishnoma qo'ng'irog'i; filial tanlash; foydalanuvchi menyusi |
| Holatlar | `EmptyState` 76 faylda, `ErrorState` 106, `Skeleton` 92 (`useQuery` — 152 fayl) |
| A11y asosi | Dialoglarda fokus tutqichi va Esc, `aria-label` 263 joyda, `focus-visible` halqasi tugma va inputlarda |

## 3. Current problems (o'lchangan)

| # | Muammo | Dalil |
|---|---|---|
| 1 | **Semantik status ranglari token emas** — success/warning/danger/info to'g'ridan-to'g'ri palitra klasslari bilan | 746 ta xom palitra klassi: `red` 342, `emerald` 201, `amber` 127, `slate` 44, `violet` 12, `sky`/`orange` 8 dan, `teal` 4 |
| 2 | **Status → rang xaritasi tarqoq** | 20 faylda alohida `status → tone` jadvali; yagona `StatusBadge` yo'q |
| 3 | **Inter shrifti yuklanmaydi** — `--font-sans` da nomi bor, lekin font fayli/`@font-face` yo'q → tizim shrifti | `index.html`, `index.css`, `package.json` |
| 4 | **Tipografiya shkalasi yo'q** | `text-xs` 567 va `text-sm` 491 — deyarli hamma narsa ikki o'lchamda; `text-[11px]`/`[10px]` 19 marta; sarlavha darajalari sahifama-sahifa farq qiladi |
| 5 | **Radius izchil emas** | `rounded-lg` 120, `rounded-xl` 108, `rounded-md` 33, `rounded` 18, `rounded-2xl` 2 — qoida yo'q |
| 6 | **Soya shkalasi yo'q** | 7 xil variant (`xs`…`2xl`) |
| 7 | Ixtiyoriy qiymatlar | `[..px]` — 33 ta; hex rang TSX ichida — 21 ta (8 fayl, asosan grafiklar) |
| 8 | **`title=` atributi tooltip o'rnida** | 241 joyda; klaviatura va sensorli ekranda ko'rinmaydi |
| 9 | Xom `<button>` | 75 ta (`Button` komponentidan tashqari) — ko'pi ikonka tugmasi, `IconButton` yo'q |
| 10 | Emoji UI'da | 6 ta, 4 faylda (`AttendanceRanking`, `PortalAttemptPage`, `BadgeFormModal`, `BroadcastsPage`) |

## 4. Duplicated components

| Takrorlanish | Soni | Yechim |
|---|---|---|
| KPI / stat karta (`StatCard`, `KpiCard`, `Metric…`) | **12+ faylda** mahalliy nusxa | bitta `StatCard` |
| Tablar (`activeTab` + qo'lda tugmalar) | **18 fayl** | bitta `Tabs` (ARIA `tablist`) |
| Jadval | 3 xil: `Table` primitivlari (39 fayl), `ColumnTable` (8), xom `<table>` (5) | bitta `DataTable` |
| Status belgisi | 20 ta xarita | `StatusBadge` + markaziy registr |
| Filtr paneli | har ro'yxat sahifasida qo'lda yig'ilgan | `FilterBar` |
| Vaqt chizig'i | `LeadTimeline` va faoliyat ro'yxatlari alohida | `Timeline` |

## 5. Reusable components — bor / yo'q

| `dizayn.md` §32 | Holat |
|---|---|
| Button, Input, Select, Badge, Avatar, Card, Table, Modal, Alert, Skeleton, EmptyState, ErrorState, PageHeader, SearchBar (`SearchInput`), ConfirmDialog, Toast (`sonner`), Dropdown (`ActionMenu`) | **bor** — tokenlarga o'tkaziladi |
| DatePicker | qisman (`DateRangePicker`; yakka sana — brauzer `type="date"`) |
| **IconButton, Combobox / search-select, Tabs, Drawer, Tooltip, StatCard, Breadcrumb, FilterBar, DataTable, Timeline, StatusBadge, Multi-select, Currency input, File upload** | **yo'q** |

## 6. Pages

74 marshrut. Guruhlar: umumiy (dashboard, direktor paneli, analitika, faoliyat, ogohlantirishlar, AI, avtomatlashtirish),
sotuv (leadlar — jadval **va** kanban bor, follow-up, rejalar, takliflar, chegirmalar), o'quv jarayoni (16 band),
moliya (8), boshqaruv (7), shaxsiy (3), kabinet (22).

`dizayn.md` talab qilgan, lekin **hozir yo'q** sahifalar:

- **Guruh sahifasi** (§17) — faqat ro'yxat va modallar (`GroupsPage`, `GroupFormModal`, `GroupMasteryModal`).
- **O'qituvchi profili** (§16) — modal (`TeacherDetailModal`), to'liq sahifa emas.
- O'quvchi profili bor (`students/profile/*`, 11 fayl), lekin "Student 360" tuzilishida emas.

Bular yangi **sahifa** (frontend), yangi funksiya emas — faqat mavjud API ma'lumoti bilan quriladi; API'da yo'q bo'lim
qo'shilmaydi (§12, "NO FAKE FEATURES").

## 7. Major UX problems

1. **Navigatsiya ortiqcha yuklangan**: 46 band, "O'quv jarayoni" bo'limida 16 ta (o'qituvchilar, ota-onalar, reyting,
   fikr-mulohaza, "mening daromadim" ham shu yerda); "Umumiy" da dashboard, analitika, AI va avtomatlashtirish aralash.
   Bo'limlar yig'ilmaydi.
2. **"Qayerdaman?"** — breadcrumb yo'q; tafsilot sahifalarida orqaga qaytish har xil.
3. **Jadval imkoniyatlari notekis**: saralash 9 faylda, ommaviy amal 3 faylda, ustun sozlamasi 8 jadvalda, zichlik
   (compact/comfortable) hech qayerda, yopishqoq sarlavha yo'q.
4. **Drawer yo'q** — tezkor ko'rish ham, katta forma ham modalda (74 fayl modal ishlatadi); o'qituvchi tafsiloti modalga
   sig'dirilgan.
5. **Dashboard**: ikki sahifa (`DashboardPage`, `ExecutivePage`) o'z KPI kartalari bilan; ierarxiya kartalar soniga
   tayanadi.
6. AI — sahifa va tablar bor, lekin "xulosa → sabab → tavsiya → amal" yagona blok ko'rinishi yo'q.
7. Bildirishnomalar — qo'ng'iroq ochiladigan ro'yxat; toifa/ustuvorlik filtri bilan drawer emas.
8. "…topilmadi" matni 35 faylda uchraydi — bir qismi `EmptyState` ichida (to'g'ri), bir qismi xom matn; har biri
   tekshirilib `EmptyState` (ikonka, sarlavha, izoh, amal) ga o'tkaziladi.

## 8. Responsive problems

- Jadvallar mobil'da faqat gorizontal aylanadi — moslashuvchan karta ko'rinishi yo'q.
- Filtrlar mobil'da qatorlarga yoyiladi (drawer yo'q).
- Qator amallari: `ActionMenu` bor, mobil'da bottom sheet emas.
- Sidebar kengligi 256px (talab ~240px); yig'ilgani 72px — mos.
- Yaxshi tomoni: modal mobil'da pastdan chiqadi, sidebar drawer, E2E'da mobil davomat testi bor.

## 9. Accessibility problems

- Tooltip o'rnida `title=` (241) — klaviaturada ochilmaydi.
- `outline-none` 21 joyda — har birida `focus-visible` almashtirgichi borligi tekshirilishi kerak.
- Qo'lda yasalgan 18 ta tab — `role="tab"`/strelka bilan boshqarish izchil emas.
- Faqat rang bilan berilgan holatlar (qizil/yashil matn) — ikonka yoki matn bilan qo'llab-quvvatlash kerak.
- Kontrast dark mode'da tokenlar almashgach qayta o'lchanadi (hozir o'lchanmagan).

## 10. Recommended redesign architecture

```
tokens (index.css)  →  primitives (components/ui)  →  patterns (DataTable, FilterBar, StatCard, PageHeader, Tabs, Drawer)
                                                   →  shell (layouts)  →  pages
```

- **Tokenlar** `src/index.css` da (Tailwind 4 `@theme`): rang (sirt + brend + `success/warning/danger/info` light/dark),
  tipografiya shkalasi, radius (6/8/12/16), soya (2 daraja), z-index, o'tish vaqtlari. Bo'shliq — Tailwind'ning 4px shkalasi.
- **Yangi kutubxona qo'shilmaydi** (§36): Drawer, Tabs, Tooltip, Combobox mavjud `Modal`/`useFocusTrap` naqshida yoziladi.
  Yagona qo'shimcha — Inter shrifti (o'zimizda saqlanadigan fayl, tashqi CDN emas).
- **Ko'chirish usuli**: avval primitiv ichida token → hamma sahifa birdaniga yangilanadi; keyin sahifalar faza bo'yicha
  yangi naqshlarga o'tadi. Eski va yangi komponent bir vaqtda yashay oladi.

## 11. O'zgaradigan fayllar

`frontend/src/index.css`, `components/ui/*`, `components/*` (PageHeader, GlobalSearch, DateRangePicker, ExportMenu,
ColumnSettings), `layouts/*`, `pages/**` (faqat JSX/klasslar va kompozitsiya), `frontend/index.html` (shrift),
yangi `docs/design-system.md`.

## 12. O'zgarmaydigan fayllar

- `backend/**`, `code-runner/**`, Prisma, migratsiyalar — umuman.
- `frontend/src/services/**`, `types/**`, `store/auth.store`, `lib/api`, `utils/permissions`, `utils/permissionKeys`,
  `validators`/zod sxemalari, `hooks` dagi ma'lumot olish mantiqi.
- Marshrut yo'llari (`routes/index.tsx` dagi `path` lar) va har marshrutning ruxsat tekshiruvi.
- So'rov kalitlari, mutatsiyalar, forma maydonlari va validatsiya qoidalari.

## 13. Cheklov: mavjud testlar

E2E (48 ssenariy) elementlarni **rol, label va ko'rinadigan matn** bo'yicha topadi (400 ta `getByRole/Label/Text`, CSS
klass bo'yicha 0). Demak klasslarni o'zgartirish xavfsiz, lekin **tugma nomlari, label'lar, sarlavhalar va ARIA rollari**
o'zgarsa testlar yiqiladi. Qoida: matn/rol o'zgarishi faqat ataylab, test bilan birga va kamida shunchalik qat'iy.
Frontend komponent testlari (136) ham shu tarzda.
