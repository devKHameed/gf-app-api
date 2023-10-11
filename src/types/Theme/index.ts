export type ThemeElementTemplate = {
  id: string;
  slug: string;
  name: string;
  input_type: string;
  key_name: string;
  default_value: string;
  parent_group: number;
  sort_order: number;
  description: string;
  is_public: number;
  created_at: string;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type Theme = {
  id: string;
  slug: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ThemeElement = {
  id: string;
  slug: string;
  meta_data: Record<string, unknown>;
  sort_order: number;
  parent_theme: string;
  parent_element: string;
  created_at: string;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};
