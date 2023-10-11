export type ProjectEvent = {
  id: string;
  slug: string;
  project_id: string;
  task_id: string;
  action_item_id: string;
  event_type: string;
  event_value: object;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseProjectEvent = Omit<ProjectEvent, "is_deleted">;
export type ResponseProjectEventList = ResponseProjectEvent[];
