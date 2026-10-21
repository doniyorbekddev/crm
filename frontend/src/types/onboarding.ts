/** O'quvchi ma'lumotidan ota-ona profillari yaratish natijasi (ko'rib chiqish yoki bajarilgan) */
export interface ParentImportResult {
  dryRun: boolean;
  created: number;
  linkedToExisting: number;
  skippedAlreadyLinked: number;
  items: Array<{ phone: string; parentName: string; action: 'CREATE' | 'LINK'; students: Array<{ id: string; name: string; code: string }> }>;
}

export interface TelegramInviteLink {
  deepLink: string | null;
  linked: boolean;
  expiresAt: string | null;
}

/** Guruh uchun chop etiladigan Telegram taklifnomalari */
export interface GroupTelegramInvites {
  group: { id: string; name: string; courseName: string };
  enabled: boolean;
  generatedAt: string;
  rows: Array<{
    student: { id: string; name: string; code: string };
    link: TelegramInviteLink;
    parents: Array<{ id: string; name: string; phone: string; link: TelegramInviteLink }>;
  }>;
}
