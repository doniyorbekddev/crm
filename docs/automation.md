# Avtomatlashtirish (PHASE 13)

TZ 3.0 §50–51: **EVENT → CONDITION → ACTION** va quruvchi (Trigger, Condition, Action, Channel, Schedule).

## 1. Ikki turdagi qoidalar

| | Tizim qoidalari | Maxsus qoidalar (quruvchi) |
|---|---|---|
| Kim yaratadi | migratsiya (7 ta: ketma-ket kelmaslik, to'lov, xavf, follow-up, ombor, sertifikat) | rahbar — **Avtomatlashtirish → Yangi qoida** |
| Sozlash | yoqish/o'chirish, parametr, auditoriya | trigger, shart, amallar, kanal, jadval — to'liq |
| O'chirish | yo'q (faqat to'xtatish) | bor (yaratilgan ish/ogohlantirishlar qoladi) |
| Qachon ishlaydi | har 30 daqiqalik yurishda | o'z jadvali: har soat / har kuni HH:00 / har hafta (kun, HH:00) — o'quv markaz vaqti |

## 2. Triggerlar (akademik)

| Trigger | Shart | Standart |
|---|---|---|
| Ketma-ket darsga kelmadi | nechta dars | 3 |
| Vazifa topshirish past | chegara %, davr (kun), kamida 2 vazifa | 60%, 30 kun |
| Imtihon natijasi past | chegara %, davr | 60%, 7 kun |
| Mavzu o'zlashtirishi past | chegara % | 40% |
| Kabinetga kirmagan | necha kun | 7 |
| Vazifa topshirmagan | necha kun (muddati o'tgan vazifa bor, hech biri topshirilmagan) | 14 |
| Xavf darajasi kritik | — | — |

Qo'shimcha shart: kurs yoki guruh (mavjudligi tekshiriladi).

## 3. Amallar va kanal

| Amal | Nima qiladi |
|---|---|
| Xabar yuborish | o'qituvchiga (guruh o'qituvchisi), rahbarlarga (`student.manage`), o'quvchiga, ota-onaga; **kanal**: ilova + Telegram / faqat ilova / faqat Telegram (foydalanuvchi sozlamasi baribir ustun) |
| Ish yaratish | o'qituvchi yoki rahbarga `Task` (muddat, o'quvchi sahifasiga havola) |
| Ogohlantirish yaratish | `ACADEMIC_RISK` ogohlantirishi (ogohlantirish sozlamasida o'chirilgan bo'lsa — yaratilmaydi) |
| Vazifa tayyorlash | o'quvchi uchun **qoralama** individual vazifa (mavzu bilan) + o'qituvchiga "ko'rib chiqing" ishi — avtomatik e'lon qilinmaydi |
| Quiz tavsiya qilish | o'qituvchiga ish: mavzu bo'yicha 10 savollik quiz (remedial reja — AI guruh tahlilida) |

**Takrorlanmaslik**: har amal `qoida + holat + kun` kaliti bilan — qoida kuniga necha marta ishlasa ham bir holat
uchun bir xabar/ish/ogohlantirish. **Sinov (dry-run)**: `POST /automation/test` — nechta holat mos kelishi va
10 ta namuna; hech narsa yuborilmaydi va yaratilmaydi.

## 4. Ishlar (Task)

`/tasks` — **Ishlarim**: har xodim o'z ishlarini ko'radi, "Bajarildi"/"Bekor" qiladi (audit); rahbar
(`alert.manage`) — barcha xodimlarniki. Kabinet hisoblariga yopiq.

## 5. Xavfsizlik

- Whitelist: faqat ro'yxatdagi triggerlar va amallar; shart va amallar zod bilan `strict` tekshiriladi
  (noma'lum maydon yoki amal — 422). Kod, SQL yoki ixtiyoriy so'rov yo'q.
- Qoida yaratish/tahrirlash/o'chirish — `alert.manage`; audit (`automation.rule_created/updated/deleted`).
- Vazifa qoralamasi qoida egasi nomidan; e'lon qilish — o'qituvchi qarori.

## 6. API

| Metod | Yo'l |
|---|---|
| GET | `/automation` — qoidalar (tizim + maxsus) |
| POST | `/automation` — yangi maxsus qoida |
| PUT | `/automation/custom/:key` — maxsus qoidani tahrirlash |
| PUT | `/automation/:key` — yoqish/o'chirish, parametr (hamma qoida) |
| DELETE | `/automation/:key` — maxsus qoidani o'chirish |
| POST | `/automation/test` — sinov |
| POST | `/automation/run` — hozir ishga tushirish |
| GET / PATCH | `/tasks`, `/tasks/:id` |
