export type UserNote = {
  id: string;
  slug: string;
  title: string;
  value: string;
  tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  is_deleted: number;
};
