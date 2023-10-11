export type Media = {
  id: number;
  title: string;
  s3_path: string;
  media_type: "image" | "video" | "folder";
  created_at: string;
  updated_at: string;
  parent_id?: number;
  is_deleted: 0 | 1;
  path?: string;
};
