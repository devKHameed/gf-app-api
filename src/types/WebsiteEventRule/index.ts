export type WebsiteEventRule = {
  id: string;
  slug: string;
  name: string;
  description: string;
  parent_site_id: string;
  rule_settings: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};
