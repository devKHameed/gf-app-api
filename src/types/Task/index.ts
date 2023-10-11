export type Task = {
  id: string;
  slug: string;
  title: string;
  description: string;
  custom_data: object;
  created_by: string;
  due_date: string | null;
  start_date: string | null;
  status: string;
  project_slug: string;
  task_type_slug: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseTask = Omit<Task, "is_deleted">;
export type ResponseTaskList = ResponseTask[];
