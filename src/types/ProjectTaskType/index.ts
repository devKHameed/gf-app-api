export type ProjectTaskType = {
  id: string;
  slug: string;
  title: string;
  custom_fields: object;
  color: string;
  icon: string;
  statuses: object;
  default_rules: object;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseProjectTaskType = Omit<ProjectTaskType, "is_deleted">;
export type ResponseProjectTaskTypeList = ResponseProjectTaskType[];
