export interface AiTool {
  key: string;
  title: string;
  samples: string[];
  /** Foydalanuvchining ruxsati yetadimi */
  allowed: boolean;
}

export interface AiAnswer {
  answered: boolean;
  question: string;
  tool: { key: string; title: string } | null;
  answer: string;
  details: string[];
  link: string | null;
  /** Javob topilmasa sabab: "Savol tushunilmadi" yoki "Ruxsat yetarli emas" */
  failure: string | null;
  suggestions: string[];
}

export interface AiHistoryItem {
  id: string;
  question: string;
  answer: string | null;
  toolKey: string | null;
  createdAt: string;
}
