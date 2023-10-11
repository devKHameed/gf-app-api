export type AffiliateProgram = {
  id: string;
  slug: string;
  is_public: boolean;
  name: string;
  description: string;
  signup_split: string;
  monthly_split: string;
  tokens_split: string;
  addl_user_split: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseAffiliateProgram = Omit<AffiliateProgram, "is_deleted">;
export type ResponseAffiliateProgramList = ResponseAffiliateProgram[];
