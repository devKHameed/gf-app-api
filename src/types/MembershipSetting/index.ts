export type MembershipSetting = {
  id: string;
  slug: string;
  name: string;
  parent_website_id: string;
  sort_order: number;
  settings: object;
  description: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseMembershipSetting = Omit<MembershipSetting, "is_deleted">;
export type ResponseMembershipSettingList = ResponseMembershipSetting[];
