import { DocumentElementType } from "../../constants/dataset";

export type DatasetDesign = {
  id: string;
  slug: string;
  dataset_slug: string;
  name: string;
  parent_type: number;
  parent_id: number;
  color: string;
  fields: {
    fields: DataField[];
  };
  created_at: string | null;
  updated_at: string | null;
  engine: "sql" | "dynamo" | "both"; //deprecate
  sql_table_name: string;
  is_active: number;
  is_deleted: number;
};
export type FormItem = {
  name: string;
  icon?: string;
  type: string;
  nested?: boolean;
  id?: string;
  children?: FormItem[];
  field_slug?: string;
};

export type DataField = {
  date_type?: "Date Only"|"Time Only"|"Date Time"
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
  [key: string]: any;
};

export type ResponseDatasetDesign = Omit<DatasetDesign, "is_deleted">;
export type ResponseDatasetDesignList = ResponseDatasetDesign[];
