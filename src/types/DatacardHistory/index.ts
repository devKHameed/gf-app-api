export type DatacardHistory = {
  id: string;
  slug: string;
  sort_order: number | string;
  associated_field_data: object | string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseDatacardHistory = Omit<DatacardHistory, "is_deleted">;
export type ResponseDatacardHistoryList = ResponseDatacardHistory[];
