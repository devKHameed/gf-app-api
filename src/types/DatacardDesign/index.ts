export type DatacardDesign = {
  id: string;
  slug: string;
  datacard_type: string;
  name: string;
  description: string;
  sort_order: number;
  icon: string;
  associated_fields: object;
  is_universal: boolean;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseDatacardDesign = Omit<DatacardDesign, "is_deleted">;
export type ResponseDatacardDesignList = ResponseDatacardDesign[];
