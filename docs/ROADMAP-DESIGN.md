# ACADEMY CRM — UI/UX redesign roadmap

> Asos: `dizayn.md` (§41 fazalar tartibi) va [DESIGN-AUDIT.md](DESIGN-AUDIT.md).
> Tartib `dizayn.md` dagi 16 faza bilan bir xil; faza ro'yxatida ko'rsatilmagan bo'limlar (§23 gamifikatsiya, §24
> bildirishnomalar, §26 drawer, §27 formalar, §28 holatlar, §38 qidiruv, §40 hujjat, kabinet) tegishli fazaga biriktirildi.

## Har faza uchun qoidalar

- Boshlash: foydalanuvchi `START PHASE N` deydi. Faza oldidan: **objective, files, components, risks, expected result**.
- Tugatish: **changed files, implemented components, tests, build result, remaining issues**; keyin commit + push va to'xtash.
- Har fazada o'tishi shart: `tsc`, lint, build, frontend testlari (136), E2E (48). Backend o'zgarmaydi.
- Buzilmaydi: API, marshrut yo'llari, ruxsat tekshiruvlari, forma mantiqi va validatsiya, so'rovlar va mutatsiyalar.
- Tugma nomi, label, sarlavha va ARIA roli o'zgarsa — faqat ataylab va test bilan birga (E2E shularga tayanadi).
- Yangi kutubxona qo'shilmaydi (istisno: Inter shrifti). Soxta ma'lumot, soxta sahifa, placeholder UI yo'q.

## PHASE 0 — Audit ✅ (2026-10-04)
`DESIGN-AUDIT.md`, ushbu roadmap. Kod o'zgarmadi.

## PHASE 1 — Design tokens + asosiy primitivlar (§6–10, §31–34) ✅ (2026-10-04)
> Bajarildi: tokenlar, lokal Inter, 18 primitiv tokenlarda, 14 yangi primitiv, `docs/design-system.md`. Sahifalardagi xom
> ranglar (677), `title=` (242) va qo'lda yasalgan tablar o'z fazasida ko'chiriladi.
- **Tokenlar** (`index.css`): `success / warning / danger / info` (fon, matn, chegara — light va dark), neytral shkala,
  tipografiya (display, h1–h3, body, small, caption, table, label), radius 6/8/12/16, soya 2 daraja, z-index, o'tish vaqtlari.
- **Inter** shriftini haqiqatan yuklash (o'zimizda saqlanadigan fayl).
- Mavjud primitivlarni tokenlarga o'tkazish: Button, Badge, Card, Input, Select, Textarea, Checkbox, Modal, Alert,
  Skeleton, EmptyState, ErrorState, Table. Shu bilan butun ilova bir qadamda yangilanadi.
- Yangi primitivlar: **IconButton, Tooltip, Tabs, Drawer, StatusBadge** (+ markaziy status registri), **StatCard**.
- Xavf: 746 ta xom palitra klassi — bu fazada faqat primitivlar ichidagilari; sahifalardagilari o'z fazasida.

## PHASE 2 — Sidebar + Topbar + navigatsiya (§11, §12, §24, §38, §39) ✅ (2026-10-04)
> Bajarildi: 8 guruhli navigatsiya (46 marshrut o'zgarmagan), 240/72px sidebar yig'iladigan guruhlar bilan, yuqori panel +
> avtomatik yo'l, qidiruv va bildirishnomalar paneli tokenlarda, kabinet qobig'i. Tafsilot sahifasi sarlavhasi varianti
> (orqaga, avatar, status) — PHASE 5/6 da, toifa bo'yicha bildirishnoma filtri — API yo'q.
- Sidebar 240px / 72px, bo'limlar yig'iladigan, faol holat; yig'ilganda Tooltip.
- Navigatsiyani qayta guruhlash (faqat mavjud 46 marshrut): Umumiy · Sotuv · O'quv jarayoni · Moliya · Odamlar ·
  Analitika · Avtomatlashtirish · Tizim. Ruxsat bo'yicha ko'rinish o'zgarmaydi.
- **Breadcrumb** va yagona **PageHeader** (sarlavha, izoh, amallar; tafsilot sahifasi varianti: orqaga, avatar, status).
- Global qidiruv (`Cmd/Ctrl+K`): toifalar bo'yicha natija, klaviatura bilan yurish — mavjud `search.service`.
- **Bildirishnomalar drawer'i**: o'qilmagan, toifa, ustuvorlik, vaqt, amal — mavjud API.
- Kabinet qobig'i (`PortalLayout`, `PortalNav`) ham shu tokenlar bilan.

## PHASE 3 — Dashboard (§13) ✅ (2026-10-05)
> Bajarildi: Dashboard KPI'lari yo'nalish bo'yicha guruhlangan `StatCard`larda, Direktor paneli 671 → 205 qator (kichik
> komponentlar), grafiklar `components/charts/chartTheme.ts` tokenlarida. Vidjet kalitlari, so'rovlar va ko'rsatkichlar o'zgarmagan.
- `DashboardPage` va `ExecutivePage`: sarlavha qatori (davr, filial, tezkor amallar), `StatCard` KPI (trend, taqqoslash),
  grafiklar (tushum, o'quvchilar o'sishi, lead voronkasi, davomat, kurslar), pastki ro'yxatlar.
- Grafik ranglari tokenlardan (hozir TSX ichida hex). Vidjet tartibi (`WidgetLayoutPanel`) saqlanadi.
- Faqat API qaytaradigan ko'rsatkichlar — yo'q KPI o'ylab topilmaydi.

## PHASE 4 — Jadvallar + filtrlar + qidiruv + formalar (§14, §27, §28) ✅ (2026-10-05)
> Bajarildi: 8 asosiy ro'yxat (o'quvchilar, leadlar, to'lovlar, qarzdorlar, guruhlar, ota-onalar, o'qituvchilar, xodimlar)
> `DataTable` + `FilterBar`da; zichlik tanlovi, "Tozalash", telefonda filtr paneli, holat tablari yagona `Tabs`da.
> Qolgan jadvallar va formalarni yangi maydonlarga (Combobox, CurrencyInput …) o'tkazish — o'z bo'limi fazasida.
- **DataTable**: yopishqoq sarlavha, saralash, ustun ko'rinishi/tartibi (mavjud `ColumnSettings`), zichlik
  (compact/comfortable), qator tanlash + ommaviy amallar, qator amallari bitta menyuda, skeleton/bo'sh/xato holatlari.
- **FilterBar** (mobil'da drawer), eksport (mavjud `ExportMenu`), sahifalash.
- Forma tizimi: Combobox (qidiruvli tanlash), Multi-select, sana/vaqt, valyuta kiritish, fayl yuklash; inline validatsiya.
- 3 xil jadval yo'li (39 + 8 + 5 fayl) bittaga keltiriladi — asosiy ro'yxatlardan boshlab, qolganlari o'z fazasida.

## PHASE 5 — O'quvchi / O'qituvchi / Ota-ona (§15, §16) ✅ (2026-10-05)
> Bajarildi: O'quvchi 360 (`ProfileHeader`: holat, xavf, asosiy ma'lumot, tezkor amallar, ko'rsatkichlar; yagona `Tabs`),
> o'qituvchi profili modaldan sahifaga (`/teachers/:id`), o'quvchi/o'qituvchi/ota-ona papkalarida ranglar tokenlarda
> (`frontend/scripts/tokenize-colors.py`).
- **Student 360**: sarlavha (avatar, ID, status, kurs, guruh, filial), tezkor amallar, tablar (Umumiy, Akademik,
  Davomat, Vazifa, Imtihon, To'lov, XP, Sertifikat, Faoliyat) — mavjud `students/profile/*` qayta kompozitsiya qilinadi.
- **O'qituvchi profili**: modal (`TeacherDetailModal`) → to'liq sahifa; KPI vizualizatsiyasi. Yangi marshrut qo'shiladi,
  mavjudlari o'zgarmaydi.
- Ota-onalar ro'yxati va kabinetdagi farzand kartalari.

## PHASE 6 — Guruhlar + Kurslar + Darslar (§17) ✅ (2026-10-05)
> Bajarildi: guruh sahifasi (`/groups/:id`: sarlavha, amallar, o'quvchilar ko'rsatkichlari jadvali — O'qituvchi markazi bilan
> umumiy `GroupStudentsTable`), kurslar filtri `FilterBar`da, guruh/kurs/xona/o'qitish papkalarida ranglar tokenlarda.
> Dars dasturi (LMS) sahifalarining ichki tuzilishi o'zgarmadi.
- **Guruh sahifasi** (hozir yo'q): sarlavha (o'qituvchi, kurs, xona, jadval, o'quvchilar soni) va tablar — faqat mavjud
  API beradigan bo'limlar. Kurslar, dars dasturi (LMS), xonalar.

## PHASE 7 — Vazifa + Imtihon + Progress + Gamifikatsiya (§21, §22, §23) ✅ (2026-10-05)
> Bajarildi: vazifa, imtihon, savollar, reyting va kabinet papkalarida ranglar tokenlarda; reyting davri yagona Tabs'da; kabinet ko'rsatkichlari StatCard'da; imtihon topshirish sahifasida jarayon chizig'i va savollar navigatsiyasi; emoji o'rniga ikonkalar (bazadagi nishon/daraja ikonkalari — foydalanuvchi ma'lumoti, o'zgarmagan).
- Vazifa: holatlar bo'yicha ko'rinish, topshiriq (fayl/matn/kod, baho, izoh), yagona status tizimi.
- Imtihon: boshqaruv va tafsilot (savollar, variantlar, urinishlar, natijalar); **o'quvchi imtihon interfeysi**
  (`PortalAttemptPage`) — chalg'itmaydigan, taymer, savollar navigatsiyasi, tasdiq.
- Progress / o'zlashtirish; XP, nishon, daraja, reyting — professional, "o'yinchoq" emas. Emoji → ikonka.

## PHASE 8 — Davomat (§20) ✅ (2026-10-05)
> Bajarildi: davomat bo'limlari yagona Tabs'da, ranglar tokenlarda, reytingda emoji medallar o'rniga o'rin belgisi. Belgilash oqimi (bitta bosish, "Hammasi keldi", saqlash) va mobil E2E o'zgarmagan.
- Guruh → dars → ro'yxat; bitta bosishda status, ommaviy belgilash, klaviatura bilan ishlash, mobil'da qulay.
- Mavjud mobil E2E testi saqlanadi.

## PHASE 9 — Sotuv / Leadlar (§19) ✅ (2026-10-05)
> Bajarildi: lead filtrlari FilterBar'da (telefonda panel, faol filtrlar soni), lead tarixi va follow-up tablari yagona Tabs'da (sanoq, kechikkanlar qizil), ranglar tokenlarda (kanban ustunlari, vaqt chizig'i, ball). Lead profili sarlavhasi tuzilishi o'zgarmadi (ko'p amalli, E2E bilan zich bog'langan).
- Jadval va kanban (bor) yangi kartalar bilan; lead tafsiloti drawer + sahifa; `Timeline` (qo'ng'iroq, follow-up,
  sinov darsi, status o'zgarishi). Bosqichlar — tizimdagi mavjud statuslar.

## PHASE 10 — Moliya (§18) ✅ (2026-10-05)
> Bajarildi: moliya, to'lovlar, qarzdorlik, chegirmalar, ombor va HR papkalarida ranglar tokenlarda; ko'rsatkich kartalari yagona StatCard'da (ishora ma'no bo'lgan joyda valueTone); xarajat holati va pul oqimi davri Tabs'da; grafik ranglari tokenlardan (hex yo'q).
- KPI (tushum, xarajat, foyda, qarz, kassa, bank), tranzaksiyalar jadvali, summalar bir xil formatda (`formatMoney`),
  musbat/manfiy — semantik rang; ortiqcha rang yo'q. To'lovlar, qarzlar, xarajatlar, maoshlar, ombor.

## PHASE 11 — Analitika / Hisobotlar ✅ (2026-10-05)
> Bajarildi: analitika, akademik analitika, hisobotlar, faoliyat, fikr-mulohaza va ogohlantirishlarda ranglar tokenlarda; kesim va holat tanlovlari yagona Tabs'da; ko'rsatkichlar StatCard'da; grafiklar chart tokenlarida (PHASE 10 da).
- Analitika, akademik analitika, hisobotlar, faoliyat: yagona grafik uslubi, `DataTable`, davr tanlash.

## PHASE 12 — AI (§25)
- "Xulosa → Sabab → Tavsiya → Amal" bloklari; **AI Generated** belgisi; xavf tahlili, qoralama. Chat oynasi emas.

## PHASE 13 — Sozlamalar va boshqaruv
- Markaz ma'lumotlari, rollar va ruxsatlar, foydalanuvchilar, xodimlar, filiallar, audit jurnali, avtomatlashtirish,
  ommaviy xabar, profil, tizim holati.

## PHASE 14 — Responsive (§29)
- Har sahifa 5 kenglikda tekshiriladi: jadval → moslashuvchan karta yoki gorizontal aylanish, amallar → bottom sheet,
  filtr → drawer, forma → bir ustun. Kabinet sahifalari (22) ham.

## PHASE 15 — Dark mode (§30)
- Neytral qorong'i sirtlar, har token juftligi uchun kontrast o'lchanadi; grafiklar va status ranglari dark'da.

## PHASE 16 — Accessibility + Performance + hujjat (§35, §36, §40)
- Klaviatura, fokus, ARIA, kontrast, dialog/forma; `title=` (241) → Tooltip qoldiqlari.
- Bundle hajmi oldin/keyin, keraksiz qayta chizish, takror so'rovlar.
- **`docs/design-system.md`** — §40 dagi 16 band; yakuniy tekshiruv ro'yxati (§45).

## Ochiq savollar (javob bo'lmasa — tavsiya bilan davom etiladi)
1. **Asosiy rang**: mavjud `brand` (ko'k/indigo) saqlanadi. *Tavsiya: ha.*
2. **Interfeys tili**: o'zbekcha qoladi (`dizayn.md` dagi inglizcha nomlar — misol). *Tavsiya: ha.*
3. **Navigatsiya guruhlari** o'zgaradi (yo'llar emas) — foydalanuvchilar odatlangan tartib almashadi. *Tavsiya: PHASE 2 da
   yangi guruhlash, oldindan ro'yxatni ko'rsatib.*
4. **O'qituvchi va guruh uchun yangi sahifa** (yangi marshrut) qo'shiladi. *Tavsiya: ha, faqat mavjud API bilan.*
