export type ProjectTag = {
  id: string;
  slug: string;
  tag: string;
  project_slug: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseProjectTag = Omit<ProjectTag, "is_deleted">;
export type ResponseProjectTagList = ResponseProjectTag[];
