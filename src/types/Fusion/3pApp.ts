export type ThreePApp = {
  app_status: string;
  app_label: string;
  app_description: string;
  app_color: string;
  app_logo: string;
  app_color_logo: string;
  app_tags: string[];
  app_language: string;
  base_structure: ThreePAppBaseStructure;
  common_data: Record<string, any>;
  invite_only: boolean;
  app_version: string;
  groups: Record<string, any>[];
  read_me: string;
  is_active: boolean;
  app_name: string;
  slug: string;
  id: string;
  app_invite_code: string;
};

export type ThreePAppBaseStructure = {
  headers: Record<string, string>;
  baseUrl: string;
  aws?: {
    key: string;
    secret: string;
    region: string;
  };
};

export type CommunicationTrigger = {
  id?: string;
  date?: string;
  type?: "id" | "date";
  order?: "asc" | "desc";
};

export type ThreePAppCommunication = {
  response?: {
    output?: string | Record<string, unknown>;
    temp?: Record<string, unknown>;
    iterate?: string;
    trigger?: CommunicationTrigger;
    limit?: number;
    type?: string;
  };
  temp?: Record<string, unknown>;
  condition?: string | boolean;
  method?: string;
  url?: string;
  qs?: string | Record<string, unknown>;
  headers?: string | Record<string, unknown>;
  aws?: {
    key: string;
    secret: string;
    region: string;
  };
} & (
  | {
      type?: "urlencoded" | "json";
      body?: string | Record<string, unknown>;
    }
  | {
      type?: "multipart/form-data";
      body?: MultipartBody;
    }
);

export type MultipartBody = {
  file: {
    value: string;
    options: Record<string, unknown>;
  };
};

export type ThreePAppModule = {
  module_name: string;
  label: string;
  connection_id: string;
  alt_connection_id: string;
  module_type: string;
  module_action: string;
  description: string;
  search: string;
  communication: ThreePAppCommunication | ThreePAppCommunication[];
  static_parameters: Record<string, any>[];
  mappable_parameters: MappableParameter[];
  interface: Record<string, any>[];
  samples: Record<string, any>;
  required_scope: Record<string, any>[];
  availability: string;
  allow_for_invite: boolean;
  shared_url_address: string;
  detach: Record<string, any>;
  attach: Record<string, any>;
  epoch: Record<string, any>;
  universal_subtype: string;
  is_active: boolean;
  slug: string;
};

export type ThreePAppConnection = {
  id: string;
  label: string;
  type: string;
  communication: Record<string, any>;
  common_data: Record<string, any>;
  scope_list: Record<string, any>;
  default_scope: Record<string, any>[];
  app_parameters: Record<string, any>[];
  is_active: boolean;
  slug: string;
  meta_data: Record<string, unknown>;
};

export type MappableParameter = {
  name?: string;
  label?: string;
  help?: string;
  type?: string;
  required?: boolean;
  default?: unknown;
  advanced?: boolean;
  nested?: string | MappableParameter | MappableParameter[];
  [key: string]: unknown;
};

export type GFMLFunctionGroup = {
  function_group_name: string;
  function_group_sub_groups: GFMLFunctionSubGroups[];
};

export type GFMLFunctionSubGroups = {
  function_sub_group_name: string;
  functions: Partial<GFMLFunction>[];
};

export type GFMLFunction = {
  created_at: string;
  function_button_title: string;
  function_group: string;
  function_preview: string;
  function_script: string;
  function_value: string;
  function_slug: string;
  function_sub_group: string;
  function_subtitle: string;
  function_title: string;
  id: string;
  is_active: boolean;
  is_deleted: boolean;
  slug: string;
  updated_at: string;
  function_color: string;
};

export type ThreePAppWebhook = {
  label: string;
  incoming_communication: Record<string, any>;
  connection_id: string;
  alt_connection_id: string;
  shared_url_address: string;
  app_parameters: Record<string, any>[];
  app_detach: Record<string, any>;
  app_attach: Record<string, any>;
  is_active: boolean;
  slug: string;
  webhook_type: string;
};

export type ThreePAppRemoteProcedure = {
  module_name: string;
  label: string;
  description: string;
  communication: Record<string, any>;
  connection_id: string;
  alt_connection_id: string;
  app_parameters: Record<string, any>[];
  is_active: boolean;
  slug: string;
};

export type ThreePAppList = ThreePApp[];
export type ThreePAppConnectionList = ThreePAppConnection[];
export type ThreePAppWebhookList = ThreePAppWebhook[];
export type ThreePAppModuleList = ThreePAppModule[];
export type ThreePAppRemoteProcedureList = ThreePAppRemoteProcedure[];
export type GFMLFunctionList = GFMLFunction[];
