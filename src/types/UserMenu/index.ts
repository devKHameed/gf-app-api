// Typing for user_menu_templates table
export interface UserMenuTemplate {
  id: number;
  template_name: string;
  template_slug: string;
  is_custom: boolean;
}

// Typing for user_menu_items table
export interface UserMenuItem {
  id: number;
  parent_menu: number;
  parent_menu_slug: string;
  gui_to_link_id: string;
  parent_menu_item_id: number;
  sort_order: number;
  label: string;
  icon?: string;
}
