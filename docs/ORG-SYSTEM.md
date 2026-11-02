# ORG System — CRM'ga joriy qilish

Manba: `ORG-SYSTEM-MASTER-DOCUMENT.md` (v1.0). Bu hujjat — hujjatning har bir bo'limi CRM'da qanday bajarilishi:
avvaldan bor imkoniyat, yangi qo'shilgani va ataylab qilinmagani.

## 1. Tahlil: hujjat ↔ CRM

| § | Talab | Holat | Qayerda / nima qilinadi |
|---|---|---|---|
| 1 | One Center — One System — One Responsible Leader | Bor | Har vazifada bitta ijrochi, audit log |
| 2, 16 | Tashkiliy tuzilma, lavozimlar, kelajakdagi lavozimlar | **Qo'shiladi** | Yangi lavozimlar, "kimga hisobot beradi", tashkiliy tuzilma sahifasi, vakant lavozimlar |
| 2.2 | Chegirma vakolati: 0–5% mustaqil, yuqorisi — CEO tasdig'i, sabab majburiy | **Qo'shiladi** | Chegirma so'rovi + tasdiq oqimi, chegara sozlamasi |
| 3.1 | Ishga qabul qilish (suhbat → demo → CEO qarori) | **Qo'shiladi** | Nomzodlar voronkasi |
| 3.2 | Sinov muddati | **Qo'shiladi** | Xodim kartasida sinov tugash sanasi + eslatma |
| 3.3 | Onboarding | **Qo'shiladi** | Onboarding ro'yxati (mas'ul bilan) |
| 3.4 | QR davomat | Bor | `a263cd3` — `docs/staff-attendance.md` |
| 3.5 | Ta'til, ruxsat, vazifani boshqaga topshirish | Bor (qisman) | Ta'til va ruxsat so'rovlari bor; vazifani topshirish — offboarding/qayta biriktirish |
| 3.6 | Kunlik / haftalik / oylik hisobot | Bor (kengaytiriladi) | Digest va haftalik hisobotga jamoa bo'limi |
| 3.7 | Topshiriq: New → In Progress → Review → Done, Overdue, kutilgan natija | **Qo'shiladi** | Vazifa holatlari va "kutilgan natija" maydoni |
| 3.8 | Telegram — rasmiy topshiriq emas | Bor | Topshiriqlar CRM'da, Telegram faqat xabar |
| 4 | View/Create/Edit/Delete/Approve, audit | Bor | Rollar va ruxsatlar, audit log |
| 5 | Oylik KPI, choraklik attestatsiya | Bor (oylik) / **qo'shiladi** (attestatsiya) | Choraklik baholash |
| 6.1 | Maosh modeli | Bor | Payroll, KPI bonusi, o'qituvchi foizi |
| 6.2 | Oy / chorak xodimi, mukofotlar | **Qo'shiladi** | Taqdirlashlar |
| 7 | Shikoyatlar: New → Under Review → Resolved → Closed, eskalatsiya; xodimlar nizolari | **Qo'shiladi** | Murojaatlar moduli |
| 8 | O'quvchi hayot sikli, ko'pga-ko'p guruh | Bor | Lead → o'quvchi, `StudentGroupMembership` |
| 9 | O'quvchini saqlab qolish | Bor | Retention, risk, qarz eslatmalari |
| 10 | Bo'lim bo'yicha oylik xarajat limiti, limitdan yuqori — CEO | **Qo'shiladi** | Bo'lim limiti; summa chegarasi bo'yicha tasdiq avvaldan bor |
| 11 | Aktivlar (inventar raqami, mas'ul, ta'mir tarixi) | **Qo'shiladi** | Aktivlar reyestri (sotiladigan tovar ombori alohida qoladi) |
| 12 | Offboarding | **Qo'shiladi** | Offboarding ro'yxati: vazifalar, jihozlar, kirishni bekor qilish |
| 13 | Karyera o'sishi | **Qo'shiladi** | Lavozim bosqichlari, ko'tarilish tavsiyasi → CEO tasdig'i |
| 14 | Bilimlar bazasi, lavozim bo'yicha ko'rinish, versiyalar | **Qo'shiladi** | Bilimlar bazasi |
| 15 | CEO dashboard | Bor (kengaytiriladi) | Jamoa bloki: davomat, vazifalar, murojaatlar, tasdiqlar, xarajat limiti |

## 2. Bosqichlar

1. **Foundation** — tashkiliy tuzilma va lavozimlar, sinov muddati, vazifa holatlari.
2. **Operations** — murojaatlar, chegirma vakolati, nomzodlar / onboarding / offboarding, aktivlar, bilimlar bazasi.
3. **Performance & Finance** — bo'lim xarajat limiti, attestatsiya, taqdirlash, karyera.
4. **Automation & Intelligence** — CEO dashboard'ning jamoa bloki, hisobotlarga jamoa bo'limi.

Har bosqich: migratsiya faqat qo'shuvchi, backend + frontend testlari, tsc/eslint, E2E.
