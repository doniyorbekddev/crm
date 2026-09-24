export interface TelegramLink {
  id: string;
  /** Bir martalik bog‘lash kodi */
  linkCode: string;
  chatId: string | null;
  chatTitle: string | null;
  verifiedAt: string | null;
  isActive: boolean;
  /** Kod shu vaqtgacha amal qiladi (bog‘langandan keyin — null) */
  codeExpiresAt: string | null;
  /** https://t.me/<bot>?start=<kod> — bot nomi sozlanmagan bo‘lsa `null` */
  deepLink: string | null;
  /** Serverda bot tokeni sozlanganmi */
  enabled: boolean;
}
