export interface TelegramLink {
  id: string;
  /** Bir martalik bog‘lash kodi */
  linkCode: string;
  chatId: string | null;
  chatTitle: string | null;
  verifiedAt: string | null;
  isActive: boolean;
  /** https://t.me/<bot>?start=<kod> — bot nomi sozlanmagan bo‘lsa `null` */
  deepLink: string | null;
  /** Serverda bot tokeni sozlanganmi */
  enabled: boolean;
}
