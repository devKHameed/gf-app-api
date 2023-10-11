export type GuiView = {
  id: string;
  slug: string;
  title: string;
  sort_order: number;
  created_by: string;
  view_type: string;
  view_settings: Record<string, unknown>;
  user_type_list: Array<string>;
  individual_user_list: Array<string>;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
  parent_gui: string;
  create_record_fields: unknown[];
  edit_record_fields: unknown[];
};

export type ResponseGuiView = Omit<GuiView, "is_deleted">;
export type ResponseGuiViewList = ResponseGuiView[];
