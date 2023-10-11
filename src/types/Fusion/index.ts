import { ImportChunk } from ".../../types/UploadDesign";
import { QueueItem } from "../../helpers/fusion/executionQueue";
import { DataField } from "../Dataset";
import { MappableParameter } from "./3pApp";

export type Fusion = {
  account_id?: string;
  fusion_title: string;
  fusion_slug?: string;
  fusion_type: string;
  fusion_tags: string[];
  fusion_description?: string;
  fusion_icon?: string;
  fusion_fields?: {
    fields?: DataField[];
  };
  input_vars: {
    type: string;
    name: string;
    slug: string;
    description?: string;
    defaultValue?: string;
    default_value?: string;
  }[];
  output_vars: {
    type: string;
    name: string;
    slug: string;
    description?: string;
    default_value?: string;
  }[];
  schedule_type: "minute_count" | "days_of_week" | "dates_of_month";
  minute_count: number;
  days_of_week: string[];
  date_of_month: string[];
  dataset_slug: string;
  fusion_status: "CLEAR" | "ERROR";
  is_active: boolean | number;
  is_deleted: boolean | number;
  socket_session_id: string;
  socket_session_metadata: Record<string, any>;
  max_duration: number;
  message_success: string;
  fusion_operators?: FusionOperator[];
  slug?: string;
  version?: number;
  widget_data?: Record<string, any>;
  session_init_vars?: Record<string, any>;
  id: string;
  created_at: string | null;
  updated_at: string | null;
  branch_count?: number;
  operator_count?: number;
  scheduling?: SchedulingConfig;
  event_slug?: string;
  parent_type?: number;
  parent_id?: number;
  event_source_slug?: string;
  epoch?: {
    id?: string;
    date?: string;
  };
  flow?: {
    nodes: {
      width: number;
      id: string;
      position: { x: number; y: number };
      type: string;
      height: number;
      data: Partial<FusionOperator>;
    }[];
    edges: {
      id: string;
      source: string;
      target: string;
      type: string;
      data: unknown;
    }[];
    viewport: {
      x: number;
      y: number;
      zoom: number;
    };
  };
  widget_action_form_data?: Record<string, any>;
  meta_data?: Record<string, unknown>;
  skill_user_fields?: BaseFields;
  skill_session_fields?: BaseFields;
  skill_user_tables?: SkillUserTable[];
  skill_user_table_sidebars?: SkillUserTableSidebar[];
  skill_user_table_modules?: SkillUserTableModule[];
  skill_description?: string;
  parallel_branch_execution?: boolean;
  folder_id?: string;
};

export type IndefiniteScheduling = {
  type: "indefinitely";
  start?: string;
  end?: string;
  interval: number; // in seconds
  restrict?: {
    days?: number[];
    months?: number[];
    time?: { from: string; to?: string };
  }[];
};

export type OnceScheduling = {
  type: "once";
  date: string;
};

export type DailyScheduling = {
  type: "daily";
  time: string;
  start?: string;
  end?: string;
};

export type WeeklyScheduling = {
  type: "weekly";
  time: string;
  start?: string;
  end?: string;
  days?: number[];
};

export type MonthlyScheduling = {
  type: "monthly";
  time: string;
  start?: string;
  end?: string;
  dates?: number[];
};

export type YearlyScheduling = {
  type: "yearly";
  time: string;
  start?: string;
  end?: string;
  dates?: number[];
  months?: number[];
};

export type SchedulingConfig =
  | IndefiniteScheduling
  | OnceScheduling
  | DailyScheduling
  | WeeklyScheduling
  | MonthlyScheduling
  | YearlyScheduling;

export type FusionOperator = {
  total_credit: number;
  app: string;
  app_module: string;
  parent_fusion_id: string;
  id?: string;
  app_id?: string;
  operator_slug: string;
  parent_operator_slug?: string;
  operator_color?: string;
  operator_subtitle?: string;
  operator_title: string;
  operator_icon?: string;
  is_start_node?: boolean;
  operator_input_settings?: Record<string, unknown>;
  created_at?: string;
  edge_data?: EdgeData;
  operator_conditions?: OperatorConditions;
  triggerResponse?: Record<string, unknown>;
  in_loop?: boolean;
  loop_data?: {
    loop_start_slug: string;
    loop_end_slug: string;
  };
  module_type?: string;
};

export type EdgeData = { label: string; condition_sets: FilterFieldType[] };
export type OperatorConditions = {
  label: string;
  condition_sets: FilterFieldType[];
};

export type FusionOutputSettings = {
  enable_conditional_output: boolean;
  query_title: string;
  query_description: string;
  output_options: FusionOutputOption[];
};

export type FusionOutputOption = {
  output_name: string;
  output_slug: string;
  output_color: string;
  output_description: string;
  output_conditions: FusionOutputCondition[];
};

export type FusionOutputCondition = {
  condition_set: FusionConditionSet[];
};

export type FusionConditionSet = {
  rhs_value: string;
  lhs_value: string;
  comparison_value: string;
};

export type FusionConnection = {
  user_id: string;
  account_id: string;
  app_id: string;
  app_connection_id: string;
  is_active: boolean;
  meta_data: Record<string, any>;
  connection_name: string;
  slug: string;
  query_string: string;
  id: string;
};

export type DataStructure = {
  name: string;
  slug: string;
  specifications: MappableParameter[];
};

export type FusionWebhook = {
  webhook_name: string;
  module_slug: string;
  fusion_slug: string;
  fusion_connection_slug: string;
  user_id: string;
  account_id: string;
  is_active: boolean;
  slug: string;
  webhook_url: string;
  get_request_headers: boolean;
  get_request_http_method: boolean;
  data_structures: DataStructure[];
  data_structure: DataStructure;
  ip_restrictions: string;
  json_passthrough: boolean;
};

export type FusionSession = {
  created_at: string;
  fusion_slug: string;
  id: string;
  is_deleted: boolean;
  is_paused: boolean;
  is_stopped: boolean;
  session_data: SessionData;
  slug: string;
  updated_at: string;
  is_chart_session?: boolean;
};

export type SessionData = {
  import_chunk?: ImportChunk;
  chunk_index?: number;
  payload?: unknown;
  account_id: string;
  session_operators: SessionOperator[];
  session_status:
    | "Building"
    | "Paused"
    | "Complete"
    | "UserCancel"
    | "Finalizing";
  session_variables?: Record<string, any>;
  user_id: string;
  fusion?: Partial<Fusion>;
  fusion_type: string;
  session_init_vars: Record<string, any>;
  account_slug: string;
  iterators: Record<
    string,
    {
      completed: number;
      iterations: number;
      branches: number;
      parent_iterator_slug: string;
      completion_status: string;
      operator_slug: string;
      execution_cycle: number;
      aggregated_response: unknown[];
    }
  >;
  branch_count?: number;
  operator_count?: number;
  app_id?: string;
  operator_responses?: OperatorResponses;
  chart_data?: Record<string, unknown>;
  aggregators?: SessionAggregators;
  loops?: OperatorLoop[];
  aurora_db_name: string;
  skill_user_variables?: Record<string, unknown>;
  skill_session_variables?: Record<string, unknown>;
  error_logs?: Record<string, unknown>[];
  start_time?: string;
  finish_time?: string;
  skill_responses?: Record<string, unknown>;
  credits_available: number;
  total_credits_used: number;
  account_package_id: string;
  parallel_branch_execution?: boolean;
};

export type OperatorResponses = Record<
  string,
  {
    operations: ResponseOperation[];
  }
>;
export type ResponseOperation = {
  id: string;
  data: OperatorData;
  created_at: number;
};

export type OperatorData = {
  inputs: Record<string, unknown>;
  outputs: unknown;
  status: string;
  logs: { url: string };
};

export type SessionAggregators = Record<
  string,
  {
    inputs: { key?: string; value: string }[];
    processed_items: number;
    item_count: number;
  }
>;

export type OperatorLoop = {
  loop_end_operator: string;
  loop_start_operator: string;
  total_iterations: number;
  iteration_index: number;
  loop_branch_count: number;
  loop_branch_index: number;
};

type BaseFields = {
  fields: DataField[];
};

type SkillUserTable = {
  id: string;
  icon?: string;
  name: string;
  slug: string;
  description: string;
  fields?: BaseFields;
  module_id: string;
  hidden?: boolean;
};

type SkillUserTableSidebar = {
  id: string;
  icon?: string;
  name: string;
  slug: string;
  description: string;
  fields?: BaseFields;
  table_id: string;
  hidden?: boolean;
  parent_sidebar_id?: string;
};

type SkillUserTableModule = {
  id: string;
  icon?: string;
  name: string;
  slug: string;
  hidden?: boolean;
};

export type SessionQueue = {
  status: string;
  queue: SessionQueueItem[];
};

export type SessionQueueItem = {
  id: string;
  operator_id: string;
  inputs: Record<string, unknown>;
  responses?: Record<
    string,
    {
      responseUrl: string;
      index?: number;
      is_loop_operator?: boolean;
      [x: string]: unknown;
    }
  >;
  path: string;
  parent_queue_path?: string;
  parent_queue_id?: string;
  branches?: SessionQueueItem[];
};

export type SessionOperator = {
  app?: string;
  app_module?: string;
  is_start_node?: boolean;
  operator_logs?: FusionOperatorLog[];
  operator_slug?: string;
  operator_status?: "Pending" | "Processing" | "Failed" | "Complete";
  operator_title?: string;
  parent_fusion_id?: string;
  started_at?: string;
  last_updated?: string;
  parent_operator_slug?: string;
  edge_data?: EdgeData;
  cycle_credit_count: number;
  total_credit_count: number;
} & Partial<FusionOperator>;

export type FusionOperatorLog = {
  message: string;
  payload: unknown;
  status: "Warning" | "Failed" | "Success" | "Processing" | "Complete";
  timestamp: string;
};

export type SystemModule = {
  module_name: string;
  label: string;
  module_type: string;
  slug: string;
  description: string;
  icon: string;
};

export type ScheduledFusion = {
  id: string;
  slug: string;
  fusion_slug: string;
  status: "Pending" | "Complete" | "Stopped";
  account_id: string;
  user_id: string;
};

export type FusionList = Fusion[];
export type FusionWebhookList = FusionWebhook[];
export type FusionConnectionList = FusionConnection[];
export type FusionSessionList = FusionSession[];

export type FusionSet = {
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
  role_based_access: Record<string, unknown>;
  individual_access: Record<string, unknown>;
  related_fields: Record<string, unknown>;
  child_fusion_flows: Record<string, unknown>;
  related_datasets: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  is_active: number;
  is_deleted: number;
};

export type FusionLambdaEvent = {
  sessionSlug: string;
  appSlug: string;
  appModuleSlug: string;
  accountId: string;
  queueItem: QueueItem;
  responses: Record<string, { responseUrl: string; index?: number }>;
};

export type ProcessOperatorParams = FusionLambdaEvent & {
  operatorLogs?: FusionOperatorLog[];
};

export type FilterFieldType = {
  condition_set: { a: string; b: string; o: string }[];
  id: string;
};
