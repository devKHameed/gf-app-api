export type Gui = {
  id: string;
  slug: string;
  title: string;
  description: string;
  created_by: string;
  icon: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type GFGuiPlugin = {
  id: string;
  slug: string;
  name: string;
  parent_app_id: string;
  parent_folder_id: string;
  sort_order: number;
  color: string;
  icon: string;
  description: string;
  current_version: string;
  iframe_display_url: string;
  role_based_access: Record<string, unknown>;
  individual_access: Record<string, unknown>;
  gui_configuration_settings: Record<string, unknown>;
  related_fusion_flows: Record<string, unknown>;
  plugin_setup_settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  is_active: number;
  is_deleted: number;
};

type Condition = {
  id: string;
  a: string;
  o: string;
  b: string | number | boolean;
};
type IncludeTabs = {
  [key: string]: any;
  id: string;
  included_fields: string[];
  name: string;
  dataset_to_include: string;
  association_type: string;
  parent_dataset_field: string;
  record_type: "single" | "list";
};
export type GFGui = {
  id: string;
  slug: string;
  name: string;
  parent_app_id: string; //string
  parent_folder_id: string; //string
  sort_order: number; //int
  color: string; //string
  icon: string; //string
  description: string; //string
  current_version: string; //string
  gui_type: string; //string
  role_based_access: Record<string, any>; //JSON
  individual_access: Record<string, any>; //JSON
  parameter_settings: Record<string, any>; //JSON
  filter_settings: { view_filters?: {[key:string]:{ condition_set: Condition[] }[]} }; //JSON
  tabs?: GuiTab[];
  plugin_settings: Record<string, any>; //JSON
  created_at: string;
  updated_at: string;
  is_active: 1 | 0;
  is_deleted: 1 | 0;
};

export type GuiTab = {
  tab_name: string;
  id: string;
} & (
  | {
      tab_type: "dashboard";
      tab_rows?: DashboardTabRow[];
    }
  | {
      tab_type: "record_list";
      dataset_design_slug: string;
      search_fields?: string[];
      form_fields?: string[];
      included_tabs?: IncludeTabs[];
      included_sidebar_widgets?: IncludeTabs[];
      associated_actions?: FusionAction[];
      filter_settings?: { view_filters?: { condition_set: Condition[] }[] };
    }
  | {
      tab_type: "workflow_board";
      dataset_design_slug: string;
      status_field: string;
      statuses_to_include?: WorkflowStatus[];
      filter_rules?: FilterRule[];
    }
  | {
      tab_type: "reviewer";
      dataset_design_slug: string;
      form_fields?: string[];
      associated_actions?: FusionAction[];
    }
);

export type FusionAction = {
  id: string;
  fusion_slug: string;
  action_title: string;
  action_icon: string;
};

export type FilterRule = { id: string; label: string };

export type WorkflowStatus = {
  status: string;
  color: string;
  label: string;
  id: string;
};

export type DashboardTabRow = {
  row_id: string;
  row_column_count: number;
};

export type GFWidgetPlugin = {
  id: string;
  slug: string;
  name: string;
  parent_app_id: string;
  parent_folder_id: string;
  sort_order: number;
  color: string;
  icon: string;
  description: string;
  current_version: string;
  iframe_display_url: string;
  role_based_access: Record<string, unknown>;
  individual_access: Record<string, unknown>;
  gui_configuration_settings: Record<string, unknown>;
  related_fusion_flows: Record<string, unknown>;
  plugin_setup_settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  is_active: number;
  is_deleted: number;
};

export type ResponseGui = Omit<Gui, "is_deleted">;
export type ResponseGuiList = ResponseGui[];
