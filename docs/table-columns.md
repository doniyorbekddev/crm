# Jadval ustunlari (column visibility)

> Academy CRM 3.1, GAP-03. Manba: `frontend/src/utils/tableColumns.ts`, `hooks/useTableColumns.ts`,
> `components/ColumnSettings.tsx`, `components/ui/ColumnTable.tsx`; backend — `validators/preference.validator.ts`.

## Imkoniyatlar

Jadval ustidagi **"Ustunlar"** tugmasi → oyna: har ustunni ko'rsatish/yashirish, yuqoriga/pastga surish,
kenglik (Avto / Tor 120px / O'rta 200px / Keng 320px), **"Standart holat"**. Yashirin ustunlar soni tugmada
ko'rinadi ("Ustunlar (2 yashirin)"). O'zgarish darhol jadvalda (optimistik) va profilda saqlanadi — boshqa
qurilmada ham shunday ochiladi.

Qoidalar: qator egasini ko'rsatuvchi ustun (o'quvchi, lead, kvitansiya…) **majburiy** — yashirilmaydi;
amallar ("…") ustuni sozlanmaydi va doim oxirida. Kod yangilanib yangi ustun qo'shilsa — saqlangan tartib
buzilmaydi, yangi ustun oxiriga qo'shiladi; olib tashlangan ustun sozlamadan o'zi tushib qoladi.

## Jadvallar

| Jadval | Sahifa | Kalit |
|---|---|---|
| O'quvchilar | `/students` | `table.students.columns` |
| Leadlar | `/leads` ("Jadval" ko'rinishi) | `table.leads.columns` |
| To'lovlar | `/payments` | `table.payments.columns` |
| Qarzdorlar | `/debts` | `table.debts.columns` |
| Guruhlar | `/groups` | `table.groups.columns` |
| Ota-onalar | `/parents` | `table.parents.columns` |
| O'qituvchilar | `/teachers` | `table.teachers.columns` |
| Xodimlar | `/employees` | `table.employees.columns` |

Yangi jadval qo'shish: kataklarni `ColumnDef` ro'yxatiga o'tkazing (`cell`, ixtiyoriy `tdClassName` — qatorga
bog'liq funksiya bo'lishi mumkin, `stopRowClick`), `useTableColumns('<nom>', columns)`, `<ColumnHeaders>`/
`<ColumnCells>` va `<ColumnSettings>`; nomni frontend `TABLE_NAMES` va backend `TABLE_PREFERENCE_NAMES` ga qo'shing.

## Saqlash va xavfsizlik

Mavjud `UserPreference` (`PUT /api/auth/me/preferences/:key`) — yangi jadval yoki API yo'q. Qat'iy sxema:
`{ columns: [{ key, visible, width? }] }`, kalit `^[a-zA-Z][a-zA-Z0-9_]{0,39}$`, takrorlanmaydi, kenglik 60–640px,
ko'pi bilan 40 ustun, ro'yxatda yo'q jadval kaliti — 422. Har xodim faqat o'zinikini o'qiydi/yozadi.

**Bu faqat ko'rinish sozlamasi.** Yashirilgan ustun ma'lumoti API javobida baribir bor va hech narsa ochilmaydi:
ruxsat va egalik backendda o'zgarmagan (test: sozlama saqlagan o'qituvchi to'lovlarni baribir ko'ra olmaydi — 403).

## Testlar

`backend/tests/preferences.test.ts`, `frontend/src/utils/tableColumns.test.ts`, `components/ColumnSettings.test.tsx`,
`e2e/specs/columns.spec.ts`; mavjud E2E (leadlar, to'lovlar, portal va h.k.) o'zgartirilgan jadvallarda o'tadi.
