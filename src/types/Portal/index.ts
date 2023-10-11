export type Portal = {
  id: string;
  slug: string;
  name: string;
  description: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponsePortal = Omit<Portal, "is_deleted">;
export type ResponsePortalList = ResponsePortal[];
