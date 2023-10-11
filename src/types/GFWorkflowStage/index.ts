export type GFWorkflowStage = {
  id: string;
  slug: string;
  parent_workflow_id: string;
  parent_stage_id: string;
  name: string;
  color: string;
  icon: string;
  description: string;
  stage_fusions: object;
  stage_fusion_events: object;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseGFWorkflowStage = Omit<GFWorkflowStage, "is_deleted">;
export type ResponseGFWorkflowStageList = ResponseGFWorkflowStage[];
