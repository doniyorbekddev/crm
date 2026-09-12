export function toSkipTake(page: number, limit: number): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}

/** "Ali Valiyev" → ["Ali", "Valiyev"] — har bir so‘z alohida maydonlar bo‘yicha qidiriladi. */
export function splitSearchTerms(search: string | undefined, maxTerms = 5): string[] {
  if (!search) return [];
  return search
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .slice(0, maxTerms);
}
