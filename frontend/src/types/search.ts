export type SearchGroupKey = 'leads' | 'students' | 'parents' | 'teachers' | 'courses' | 'groups' | 'users' | 'payments' | 'transactions';

export interface SearchHit {
  id: string;
  title: string;
  subtitle: string;
  /** L-000123, ST-000045, PM-000007, №12 yoki null */
  code: string | null;
  url: string;
}

export interface SearchGroup {
  key: SearchGroupKey;
  label: string;
  hits: SearchHit[];
}

export interface SearchResult {
  query: string;
  total: number;
  groups: SearchGroup[];
}
