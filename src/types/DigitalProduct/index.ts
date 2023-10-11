export type DigitalProduct = {
  id: string;
  slug: string;
  name: string;
  portal_id: string;
  description: string;
  variations: object;
  media: object;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseDigitalProduct = Omit<DigitalProduct, "is_deleted">;
export type ResponseDigitalProductList = ResponseDigitalProduct[];
