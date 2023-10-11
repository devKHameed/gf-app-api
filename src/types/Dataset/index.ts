export type Dataset = {
  id: string;
  slug: string;
  title: string;
  dataset_type_slug?: string;
  fields: DatasetField[];
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};
export type DatasetField = {
  [key: string]: any;
};


export type ResponseDataset = Omit<Dataset, "is_deleted">;
export type ResponseDatasetList = ResponseDataset[];
