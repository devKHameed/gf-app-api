export type GFWorkflowSession = {
  id: string;
  slug: string;
  name: string;
  session_body: string;
  session_stage: string;
  session_fields: object;
  session_history: object;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type GFWorkflowSessionTag = {
  slug: number;
  workflow_session_id: string;
  tag_value: string;
};

export type ResponseGFWorkflowSession = Omit<GFWorkflowSession, "is_deleted">;
export type ResponseGFWorkflowSessionList = ResponseGFWorkflowSession[];
