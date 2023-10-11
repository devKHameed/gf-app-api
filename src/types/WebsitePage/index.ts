export type WebsitePage = {
  id: string;
  slug: string;
  name: string;
  page_slug: string;
  parent_website_id: string;
  description: string;
  sort_order: number;
  is_public: number;
  access_settings: object;
  default_theme_id: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseWebsitePage = Omit<WebsitePage, "is_deleted">;
export type ResponseWebsitePageList = ResponseWebsitePage[];
