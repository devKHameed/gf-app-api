export type UserPermissionGroup = {
  id: string;
  slug: string;
  name: string;
  description: string;
  enable_user_management: boolean;
  enable_developer_management: boolean;
  enable_gui_management: boolean;
  enable_fusion_management: boolean;
  enable_data_management: boolean;
  enable_billing_management: boolean;
  enable_contact_management: boolean;
  sort_order: number;
  icon: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseUserPermissionGroup = Omit<
  UserPermissionGroup,
  "is_deleted"
>;
export type ResponseUserPermissionGroupList = ResponseUserPermissionGroup[];
