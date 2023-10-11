export type PresentationSlide = {
  id: string;
  slug: string;
  title: string;
  thumbnail: string;
  sort_order: number;
  slide_design: Array<object>;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponsePresentationSlide = Omit<PresentationSlide, "is_deleted">;
export type ResponsePresentationSlideList = ResponsePresentationSlide[];
