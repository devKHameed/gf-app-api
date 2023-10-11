export type MembershipOption = {
  id: string;
  slug: string;
  is_public: boolean;
  name: string;
  description: string;
  startup_price: number;
  monthly_price: number;
  start_token_inclusion: object;
  monthly_token_inclusion: object;
  user_type_inclusion: object;
  additional_user_fees: object;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseMembershipOption = Omit<MembershipOption, "is_deleted">;
export type ResponseMembershipOptionList = ResponseMembershipOption[];
