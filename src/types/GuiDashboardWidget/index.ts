import { DataField } from "types/Dataset";

export type GuiDashboardWidget = {
  id: string;
  slug: string;
  name: string; //string
  parent_gui_id: string; //string
  parent_tab_id: string; //string
  row_id: string; //string
  row_column: number; //int
  widget_type: string; //string (Line,Bar,Pie,Statistic,RecordList)
  filter_groups: WidgetFilterGroup[]; //JSON
  description: string; //string
  dummy_data_titles: Record<string, unknown>; //JSON
  associated_fusion_id: string; //string
  created_at: string;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
  create_forms?: WidgetAction[];
  edit_forms?: WidgetAction[];
};

export type WidgetFilterGroup = {
  id: string;
  title: string;
};

export type WidgetAction = {
  button_title: string;
  enable_populate_fusion: boolean;
  populate_fusion: string;
  submit_fusion: string;
  form_fields: DataField[];
  id: string;
};
