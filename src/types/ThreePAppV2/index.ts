export type ThreePAppV2 = {
  id: string;
  slug: string;
  app_status: string;
  app_name: string;
  app_label: string;
  app_description: string;
  app_color: string;
  app_logo: string;
  app_color_logo: string;
  app_tags: Record<string, unknown>;
  app_language: string;
  app_audience: string;
  base_structure: Record<string, unknown>;
  common_data: Record<string, unknown>;
  invite_only: boolean;
  app_version: string;
  groups: Record<string, unknown>;
  read_me: string;
  three_p_version: number;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ThreePAppV2Reponse = Omit<ThreePAppV2, "is_deleted">;
export type ThreePAppV2ReponseList = ThreePAppV2Reponse[];
