export type UploadDesign = {
  id: string;
  slug: string;
  title: string;
  type: "word_doc" | "image" | "csv";
  sample_file: Record<string, unknown>;
  is_active: 0 | 1;
  is_deleted: 0 | 1;
  fusion_slug: string;
  created_at: string | null;
  updated_at: string | null;
};

export type UploadDesignImport = {
  id: string;
  slug: string;
  files: { filename: string; file_url: string; type: string }[];
  status: "Pending" | "Processing" | "Completed" | "Failed" | "Preparing";
  uploaded_by: Record<string, unknown>;
  processed_records: number;
  records_count: number;
  upload_design_slug: string;
  created_at: string | null;
  updated_at: string | null;
};

export type ImportChunk = {
  id: string;
  slug: string;
  parent_slug: string;
  upload_design_slug: string;
  user_id: string;
  chunk_status: "Pending" | "Processing" | "Completed" | "Failed";
  target_fusion: string;
  processed_records: number;
  account_id: string;
  parent_data_url: string;
  is_deleted: 0 | 1;
  created_at: string | null;
  updated_at: string | null;
} & (
  | {
      type: "csv";
      chunk_data: Record<string, string>[];
      chunk_indexes: [number, number];
    }
  | {
      type: "word_doc" | "image" | "audio" | "video";
      chunk_data: { file_url: string; filename: string; type: string };
      chunk_indexes: never;
    }
);
