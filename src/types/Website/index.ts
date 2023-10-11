export type Website = {
  id: string;
  slug: string;
  name: string;
  description: string;
  favorite_icon: string;
  default_theme_id: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseWebsite = Omit<Website, "is_deleted">;
export type ResponseWebsiteList = ResponseWebsite[];
