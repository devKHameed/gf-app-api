export type Widget = {
  id: string;
  slug: string;
  name: string;
  widget_slug: string;
  parent_page_id: string;
  sort_order: number;
  is_dynamic: number;
  is_global: number;
  reference_widget: string;
  access_settings: Record<string, unknown>;
  general_settings: Record<string, unknown>;
  description: string;
  default_theme_id: string;
  created_at: string;
  updated_at: string | null;
  is_active: 1;
  is_deleted: 0;
};
