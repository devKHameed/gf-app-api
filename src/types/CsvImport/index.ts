export type PendingChunk = {
  id: string;
  slug: string;
  fusion_slug: string;
  status: "Pending" | "Complete" | "Stopped";
  account_id: string;
};

export type CsvChunk = {
  data: any[];
  account_id: string;
  parent_slug: string;
  field_targeting: string;
  target_fusion: string;
  user_id: string;
  tableName: string;
};

export type ImportItem = {
  import_results: { [key: string]: any };
  total_records: number;
};
