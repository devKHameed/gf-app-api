export type Datacard = {
  id: string;
  slug: string;
  datacard_type: string;
  datacard_design_slug: string;
  parent_record_id: string;
  parent_record_slug: string;
  sort_order: number;
  associated_field_data: object;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseDatacard = Omit<Datacard, "is_deleted">;
export type ResponseDatacardList = ResponseDatacard[];
