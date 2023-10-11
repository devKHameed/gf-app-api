export type UsageToken = {
  id: string;
  slug: string;
  is_public: boolean;
  name: string;
  description: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseUsageToken = Omit<UsageToken, "is_deleted">;
export type ResponseUsageTokenList = ResponseUsageToken[];
