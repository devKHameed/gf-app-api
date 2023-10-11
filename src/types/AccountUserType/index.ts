export type AccountUserType = {
  id: string;
  slug: string; // must be unique for this partition
  name: string; // string
  fields: Record<string, any>; // OBJ
  permissions: Record<string, any>; // OBJ
  contact_type_id: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
};

export type AccountUserTypeResponse = Omit<AccountUserType, "created_at">;
export type AccountUserTypeListResponse = AccountUserTypeResponse;
