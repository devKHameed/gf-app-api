export type ProjectType = {
  id: string;
  slug: string;
  title: string;
  custom_fields: object;
  color: string;
  icon: string;
  statuses: Array<object>;
  default_rules: Array<object>;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseProjectType = Omit<ProjectType, "is_deleted">;
export type ResponseProjectTypeList = ResponseProjectType[];
