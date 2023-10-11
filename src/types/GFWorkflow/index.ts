export type GFWorkflow = {
  id: string;
  slug: string;
  name: string;
  color: string;
  icon: string;
  description: string;
  child_fields: object;
  child_roles: object;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseGFWorkflow = Omit<GFWorkflow, "is_deleted">;
export type ResponseGFWorkflowList = ResponseGFWorkflow[];
