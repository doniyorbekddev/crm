import type { StudentFormLookups } from '@/types/student';

interface GroupOptionsProps {
  lookups: StudentFormLookups | undefined;
  /** Shu kurs guruhlari birinchi chiqadi (o'quvchining joriy kursi) */
  preferredCourseId?: string | undefined;
  /** Ro'yxatdan chiqariladigan guruh (masalan, hozirgi guruh — o'tkazish oynasida) */
  excludeGroupId?: string | undefined;
  /** To'lgan bo'lsa ham tanlanadigan guruh (tahrirlashda o'quvchining o'z guruhi) */
  keepGroupId?: string | undefined;
}

/**
 * Barcha ochiq guruhlar kurs bo'yicha `<optgroup>` larda. To'lgan guruh ko'rinadi, lekin tanlanmaydi.
 * Boshqa kursning guruhi tanlansa, chaqiruvchi o'quvchining kursini shu guruh kursiga moslaydi.
 */
export function GroupOptions({ lookups, preferredCourseId, excludeGroupId, keepGroupId }: GroupOptionsProps) {
  const courseName = new Map((lookups?.courses ?? []).map((course) => [course.id, course.name]));
  // Faqat faol kurslar guruhlari — kurs ham tanlanadigan bo'lishi kerak (o'quvchining o'z guruhi doim qoladi)
  const groups = (lookups?.groups ?? []).filter(
    (group) => group.id !== excludeGroupId && (courseName.has(group.courseId) || group.id === keepGroupId),
  );
  const courseIds = [...new Set(groups.map((group) => group.courseId))].sort((a, b) =>
    a === preferredCourseId ? -1 : b === preferredCourseId ? 1 : (courseName.get(a) ?? '').localeCompare(courseName.get(b) ?? '', 'uz'),
  );

  return (
    <>
      {courseIds.map((courseId) => (
        <optgroup key={courseId} label={courseName.get(courseId) ?? 'Boshqa kurs'}>
          {groups
            .filter((group) => group.courseId === courseId)
            .map((group) => {
              const full = group.freeSeats <= 0 && group.id !== keepGroupId;
              return (
                <option key={group.id} value={group.id} disabled={full}>
                  {group.name} · {full ? 'to‘lgan' : `${group.freeSeats} ta bo‘sh o‘rin`}
                </option>
              );
            })}
        </optgroup>
      ))}
    </>
  );
}

/** Guruh kursi nomi (ogohlantirish matni uchun) */
export function courseNameOf(lookups: StudentFormLookups | undefined, courseId: string): string {
  return lookups?.courses.find((course) => course.id === courseId)?.name ?? 'boshqa kurs';
}
