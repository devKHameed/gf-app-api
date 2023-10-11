export type DocumentDesign = {
  id: string;
  color: string;
  slug: string;
  name: string;
  fields: DocumentDesignField;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};
export type DocumentDesignField = {
  [key: string]: any;
};

export type ResponseDocumentDesign = Omit<DocumentDesign, "is_deleted">;
export type ResponseDocumentDesignList = ResponseDocumentDesign[];

export type GSI = {
  id: string;
  slug: string;
  partition_key_field: string;
  partition_key_field_type: string;
  sort_key_field: string;
  sort_key_field_type: string;
  projected_key_fields: string[];
  is_active: boolean;
  gsi_name: string;
};
