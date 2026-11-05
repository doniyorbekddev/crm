# ORG System — bosh hujjat (xulosa)

Asl hujjat — **"IT-AKADEMY ANDIJON ORGANIZATION MANAGEMENT SYSTEM · MASTER DOCUMENT v1.0"** (CEO hujjati, repoda
`ORG-SYSTEM-MASTER-DOCUMENT.md` sifatida saqlanadi, gitga kiritilmaydi). Bu fayl uning CRMdagi ijrosini bo'limlar bo'yicha ko'rsatadi.

| § | Talab | CRMda qayerda |
|---|---|---|
| 1 | One Center — One System — One Responsible Leader | Har vazifada bitta ijrochi, CEO qarorlari Admin rolida yo'q, audit log |
| 2 | Tashkiliy tuzilma, lavozimlar, kelajakdagi lavozimlar | Tashkilot → "Tashkiliy tuzilma", "Lavozimlar va bo'limlar" (vakant lavozimlar ko'rinadi) |
| 2.2 | Chegirma: 0–5% mustaqil, yuqorisi CEO tasdig'i, sabab majburiy | Chegirma so'rovi + tasdiq (`discount.grant`, `discount.approve`) |
| 3.1–3.3 | Ishga qabul, sinov muddati, onboarding | "HR jarayonlari": nomzodlar voronkasi, sinov tugash eslatmasi, onboarding ro'yxati |
| 3.4 | Davomat (o'qituvchi — dars jadvali, boshqalar — belgilangan jadval, QR) | "Xodimlar davomati": dinamik QR, versiyali jadvallar; 2026-11-05 dan **avtomatik rejim** (QR ustun) |
| 3.5 | Ta'til va ruxsat, umumiy kalendar | Ta'til / ruxsat so'rovlari va tasdiq; "Umumiy kalendar" sahifasi |
| 3.6 | Kunlik / haftalik / oylik hisobot | Kunlik xulosa (jamoa bo'limi), haftalik hisobot, Tashkilot paneli |
| 3.7 | Topshiriq: New → In Progress → Review → Done, Overdue | Vazifalar: holatlar, kutilgan natija, tekshiruv, **dalil majburiy** belgisi |
| 4 | View/Create/Edit/Delete/Approve, audit | Rollar va ruxsatlar (03-PERMISSION-MATRIX), audit log |
| 5 | Oylik KPI, choraklik attestatsiya | KPI ta'riflari va natijalari, choraklik baholash |
| 6 | Maosh modeli, rag'batlantirish | Maosh (tasdiqlash va qulflash), KPI bonusi, taqdirlash (oy/chorak xodimi) |
| 7 | Murojaatlar: New → Under Review → Resolved → Closed, eskalatsiya | "Murojaatlar" (maxfiy murojaat — faqat CEO) |
| 8–9 | O'quvchi hayot sikli, ko'pga-ko'p guruh, saqlab qolish | Lead → o'quvchi, `StudentGroupMembership`, risk va qarz eslatmalari |
| 10 | Bo'lim xarajat limiti, limitdan yuqori — CEO | Bo'lim limiti va xarajat tasdig'i |
| 11 | Aktivlar | "Aktivlar": inventar raqami, mas'ul, ta'mir va berish/qaytarish tarixi |
| 12 | Offboarding | Offboarding ro'yxati (kirish bekor qilinmaguncha yopilmaydi) |
| 13 | Karyera | Lavozimdagi keyingi lavozim, eng kam KPI va muddat, ko'tarilish → CEO tasdig'i |
| 14 | Bilimlar bazasi | Lavozim bo'yicha ko'rinish, versiyalar, "tanishdim" belgisi |
| 15 | CEO dashboard | "Tashkilot paneli": 14 vidjet + **boshqaruv xulosasi** |
| 16 | Kelajakdagi lavozimlar | Katalogda vakant lavozim sifatida |

Batafsil holat va qarorlar: [../ORG-SYSTEM.md](../ORG-SYSTEM.md).
