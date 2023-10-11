export type SylarSession = {
  id: string;
  slug: string;
  created_at: string;
  closed_at: string;
  is_open: 1 | 0;
  meta_data: { [key: string]: any };

  is_deleted: 1 | 0;
};
export type SylarSessionMessage = {
  id: string;
  slug: string;
  created_at: string;
  is_open: 1 | 0;
  meta_data: { [key: string]: any };
  by_sylar: boolean;
  chatgpt: boolean;
  is_deleted: 1 | 0;
};
