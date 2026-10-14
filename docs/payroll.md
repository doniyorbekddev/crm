# Maosh, KPI va tasdiqlash

Sahifalar: `/salaries` (direktor paneli va ro'yxat), `/salaries/{teacher|employee}/:id` (maosh profili),
`/salaries/kpi` (KPI sozlamalari). Backend: `salary.service.ts`, `kpi.service.ts`, `payrollProfile.service.ts`.

## Maosh modellari

| Kim | Hisob | Manba |
|---|---|---|
| O'qituvchi | Kelishilgan model: belgilangan, dars uchun, o'quvchi uchun, tushumdan ulush yoki aralash | `TeacherSalaryRule` (amal qilish sanasi bilan) |
| O'qituvchi ulushi | Haqiqatda tushgan to'lovlar × foiz, guruhlar bo'yicha ko'rsatiladi | `CommissionEntry`: to'lov bir marta (`sourceKey`), bekor/qaytarish — teskari yozuv |
| Xodim (administrator, operator, …) | Belgilangan maosh (oyda ishlagan kunlarga proporsional) + KPI bonusi | `Employee.baseSalary`, `Employee.kpiBonusPool` |
| Hammasi | + bonuslar − jarimalar (sabab, kim kiritgani, tasdiq) | `PayrollAdjustment` |

O'qituvchi maoshi o'quvchilar sonidan avtomatik hisoblanmaydi — faqat kelishilgan modeldagi stavkalar bo'yicha.

## KPI bonusi (direktor tanlagan qoida, 2026-10-14)

```
KPI bonusi = bonus fondi × vaznli bajarilish
bajarilish_i = min(natija_i / maqsad_i, 1)        — har KPI 100% da cheklanadi
vaznli bajarilish = Σ(vazn_i × bajarilish_i) / Σ vazn_i   — faqat ma'lumoti bor KPI'lar bo'yicha
vaznli bajarilish < chegara (standart 50%) → bonus 0
```

- Lavozimning oyda amal qiladigan KPI vaznlari yig'indisi **100%** bo'lishi kerak; aks holda bonus hisoblanmaydi va
  maoshda ogohlantirish chiqadi. Vazn 100% dan oshishiga yo'l qo'yilmaydi (validator va baza `CHECK`).
- Ma'lumoti yo'q KPI (masalan, oyda to'lov jadvali yo'q) bahoga kirmaydi — ogohlantirish bilan.
- Natijalar maosh hisoblanganda `kpiDetails` ga nusxalanadi: keyin KPI yoki fond o'zgarsa ham tasdiqlangan oy
  tushuntirib bo'ladi.

| O'lchov | Hisob |
|---|---|
| Jalb qilingan o'quvchilar | Lead o'quvchiga aylangan paytdagi mas'ul (biriktirish tarixidan) **va** o'quvchining birinchi haqiqiy to'lovi (bekor qilinmagan, to'liq qaytarilmagan) shu oyda. Bir telefon — bir marta |
| Lead konversiyasi | Oyda biriktirilgan yangi leadlardan shu oyda sotuvga aylangani |
| To'lov yig'ilishi | Filialda muddati shu oyga to'g'ri kelgan to'lov jadvali summasidan yig'ilgan sof tushum |
| Filial davomati | Kelgan + kechikkan / barcha belgilar |
| O'quvchilarni saqlash | 100 − oyda ketganlar ulushi |
| Vazifalar | Muddati shu oyda bo'lgan vazifalardan muddatida bajarilgani |
| Qo'lda | Har oy sabab bilan kiritiladi (masalan, mamnuniyat so'rovi) |

## Tasdiqlash oqimi

`Hisoblanmagan → Hisoblandi → Ko'rib chiqilmoqda → Tasdiqlandi → Qisman to'langan → To'langan`

1. Buxgalter (`salary.calculate`) oyni hisoblaydi, ogohlantirishlarni ko'radi, tuzatadi va **tasdiqlashga yuboradi**.
2. Direktor (`salary.approve`) tasdiqlaydi yoki **sabab bilan rad etadi** (maosh "Hisoblandi"ga qaytadi, yuborgan xabar oladi).
3. Ko'rib chiqilayotgan maosh summasi o'zgarsa (qayta hisoblash, bonus/jarima) — u avtomatik "Hisoblandi"ga qaytadi.
4. Tasdiqlangan maosh qotiriladi; to'lov alohida qayd etiladi (tizim pul o'tkazmaydi). Qayta ochish — `salary.unlock`, sabab bilan.

Har bir qadam audit jurnaliga yoziladi va profildagi "O'zgarishlar tarixi"da ko'rinadi.

## Ruxsatlar

| Amal | Ruxsat |
|---|---|
| Ko'rish (ro'yxat, profil, KPI) | `salary.view` |
| Hisoblash, yuborish, bonus/jarima, qo'lda KPI natijasi | `salary.calculate` |
| Tasdiqlash, rad etish, KPI va bonus fondini sozlash | `salary.approve` |
| To'lov | `salary.pay` |

O'qituvchi o'z daromadini `/my-earnings` da ko'radi (`commission.view_own`). UI faqat ko'rinishni boshqaradi —
har bir amal backendda ruxsat va holat bo'yicha tekshiriladi.
