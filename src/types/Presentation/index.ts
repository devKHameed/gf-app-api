export type Presentation = {
  id: string;
  slug: string;
  title: string;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponsePresentation = Omit<Presentation, "is_deleted">;
export type ResponsePresentationList = ResponsePresentation[];
