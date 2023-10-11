export enum DocumentElementType {
  Label = "label", //string
  TextField = "text-field", //string
  TextArea = "textarea", //string
  Checkbox = "checkbox", //json
  Radio = "radio",
  Select = "select",
  Date = "date",
  Progress = "progress-display",
  CodeEditor = "code-editor",
  File = "file",
  Image = "image",
  Video = "video",
  Location = "location",
  Number = "input-number",
  User = "user-select",
  UserType = "user-type",
  Rating = "rating",
  SubRecord = "sub-record",
  RecordList = "record-list",
  Boolean = "boolean",
  AudioVideo = "audio_video",
}

export const NumericTypes = {
  TINYINT: "TINYINT",
  SMALLINT: "SMALLINT",
  MEDIUMINT: "MEDIUMINT",
  INT: "INT",
  BIGINT: "BIGINT",
  DECIMAL: "DECIMAL",
  FLOAT: "FLOAT",
  DOUBLE: "DOUBLE",
} as const;

export type DataField = {
  date_type?: `${DateType}`;
  title: string;
  slug: string;
  type: `${DocumentElementType}`;
  tooltip?: string;
  id: string;
  list_items?: Record<string, any>[];
  list_default_display_type?: "single_drop_down" | "multi_drop_down";
  list_source?: "hardcoded" | "record_association";
  multi?: boolean;
  fields?: DataField[];
  multi_user?: boolean;
  accept?: string;
  max_size?: number;
  max_count?: number;
  required?: boolean;
  children?: DataField[];
  default_value?: any;
  file_type?: string;
  number_type?: typeof NumericTypes[keyof typeof NumericTypes];
  use_current?:boolean;
};

export enum DateType {
  DateOnly = "Date Only",
  TimeOnly = "Time Only",
  DateTime = "Date Time",
}