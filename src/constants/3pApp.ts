import { APP_NAME, STAGE } from "../config";

export const FusionLambda = {
  CompleteAutomationSession: `${APP_NAME}-${STAGE}-completeFusionSession`,
  ProcessOperators: `${APP_NAME}-${STAGE}-processOperator`,
  ProcessCrudOperators: `${APP_NAME}-${STAGE}-processCrudOperator`,
  ProcessAutomationOperators: `${APP_NAME}-${STAGE}-processAutomationOperator`,
  ProcessChatOperators: `${APP_NAME}-${STAGE}-processChatOperator`,
  ExecuteOperators: `${APP_NAME}-${STAGE}-executeOperator`,
  ProcessChartOperators: `${APP_NAME}-${STAGE}-processChartOperator`,
  SessionInt: `${APP_NAME}-${STAGE}-sessionInit`,
  ProcessWebhookResponseOperators: `${APP_NAME}-${STAGE}-processWebhookResponseOperator`,
  ProcessStripeOperators: `${APP_NAME}-${STAGE}-processStripeOperator`,
  ProcessRestApiOperators: `${APP_NAME}-${STAGE}-processRestApiOperator`,
  ProcessFlowControlOperators: `${APP_NAME}-${STAGE}-processFlowControlOperator`,
  ProcessBasicSystemOperators: `${APP_NAME}-${STAGE}-processBasicSystemOperator`,
  ProcessSkillOperators: `${APP_NAME}-${STAGE}-processSkillOperator`,
  ProcessUpdateDisplayOperatorAsync: `${APP_NAME}-${STAGE}-processUpdateDisplayAsync`,
  ProcessChartDataOperators: `${APP_NAME}-${STAGE}-processChartDataOperator`,
  ProcessGetNextTaskOperators: `${APP_NAME}-${STAGE}-processGetNextTaskOperator`,
  ProcessCompleteTaskOperators: `${APP_NAME}-${STAGE}-processCompleteTaskOperator`,
  processAWSOperators: `${APP_NAME}-${STAGE}-processAWSOperator`,
} as const;

export const AuthTypes = {
  O2ACRF: "oauth2_authorization_code_refresh_token",
  O2AC: "oauth2_authorization_code",
  BASIC: "basic_auth",
  API_KEY: "api_key",
};

export const InvocationType = {
  RequestResponse: "RequestResponse",
  Event: "Event",
};

export const CrudOperator = {
  Create: "create",
  Update: "update",
  Delete: "delete",
  Read: "read",
  ReadOne: "read_one",
  AddTag: "add_tag",
  RemoveTag: "remove_tag",
};

export const AutomationOperator = {
  Read: "social_media_automation",
};

export const CRUD_MODULES = Object.values(CrudOperator);
export const AUTOMATION_MODULES = Object.values(AutomationOperator);

export const ChatOperator = {
  SendMessage: "send_message",
  AddSubscriber: "add_subscriber",
  RemoveSubscriber: "remove_subscriber",
  CloseThread: "close_thread",
};

export const CHAT_MODULES = Object.values(ChatOperator);

export const BasicSystemOperators = {
  SetVariable: "set_variable",
  GetVariable: "get_variable",
  SetMultipleVariables: "set_multiple_variables",
  GetMultipleVariables: "get_multiple_variables",
  BasicTrigger: "basic_trigger",
  Sleep: "sleep",
  TextAggregator: "text_aggregator",
  TableAggregator: "table_aggregator",
  NumericAggregator: "numeric_aggregator",
  ConvertTextEncoding: "convert_text_encoding",
  Switch: "switch",
  IncrementFunction: "increment_function",
  ComposeString: "compose_string",
  TriggerFusion: "trigger_fusion",
};

export const SkillModules = {
  UpdateInputVariables: "update_input_variables",
  UpdateSkillUser: "update_skill_user",
  UpdateSkillSession: "update_skill_session",
  AskQuestion: "ask_question",
  CreateJob: "create_job",
  UpdateDisplay: "update_display",
  ChangeSelectedDisplay: "change_selected_display",
  ExitSkill: "exit_skill",
};

export const AWSOperators = {
  GetTemporaryS3Link: "get_temporary_s3_link",
  SplitAudio: "split_audio",
  CreateTranscriptionJob: "create_transcription_job",
  DeleteTranscriptionJob: "delete_transcription_job",
  GetTranscriptionJob: "get_transcription_job",
  ListTranscriptionJobs: "list_transcription_jobs",
  RunPodExtractFaces: "run_pod_extract_faces",
  TranscriptionJobTrigger: "transcription_job_trigger",
  ZipS3FilesFromDatasets: "zip_s3_files_from_datasets",
};

export const AWS_MODULES = Object.values(AWSOperators);

export const BASIC_SYSTEM_MODULES = Object.values(BasicSystemOperators);
export const SKILL_MODULES = Object.values(SkillModules);

export const FlowControlOperators = {
  ArrayIterator: "array_iterator",
  ArrayAggregator: "array_aggregator",
  Repeater: "repeater",
  Loop: "loop",
  LoopEnd: "loop_end",
  LoopWhile: "loop_while",
};

export const FLOW_CONTROL_MODULES = Object.values(FlowControlOperators);

export const ChartDataOperators = {
  MapChartData: "map_chart_data",
};

export const CHART_DATA_MODULES = Object.values(ChartDataOperators);
