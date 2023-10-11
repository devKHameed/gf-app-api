export type ActionItemType = {
  id: string;
  slug: string;
  title: string;
  custom_fields: object;
  color: string;
  icon: string;
  status_list: object;
  default_rules: object;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseActionItemType = Omit<ActionItemType, "is_deleted">;
export type ResponseActionItemTypeList = ResponseActionItemType[];
