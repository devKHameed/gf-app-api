export type Project = {
  id: string;
  slug: string;
  title: string;
  description: string;
  custom_data: object;
  created_by: string;
  due_date: string | null;
  start_date: string | null;
  status: string;
  roles: Record<string, any>;
  statuses: Array<string>;
  project_type_slug: string;
  project_tags: Array<string>;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ProjectUpdate = {
  id: string;
  slug: string;
  project_slug: string;
  event_type: string;
  event_data: Record<string, any>;
  created_by: Record<string, any>;
  updated_at: string | null;
  created_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ProjectSocket = {
  project_id: string;
  user_id: string;
  connection_id: string;
  created_at: string;
  updated_at: string | null;
};

export type ResponseProject = Omit<Project, "is_deleted">;
export type ResponseProjectList = ResponseProject[];

export type Folder = {
  id: string;
  slug: string;
  childs: [{ id: string; slug: string }];
};

export type UniversalTag = {
  action: string;
  record_id: string;
  tag: string;
  color: string;
};

export type PresentationSlides = {
  slug: string;
  sort_number: number;
};
