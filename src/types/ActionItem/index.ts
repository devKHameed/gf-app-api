export type ActionItem = {
  id: string;
  slug: string;
  parent_task_id: string;
  title: string;
  description: string;
  custom_data: object;
  created_by: string;
  due_date: string | null;
  start_date: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseActionItem = Omit<ActionItem, "is_deleted">;
export type ResponseActionItemList = ResponseActionItem[];
