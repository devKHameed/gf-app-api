export type UserGmailAccount = {
  id: string;
  slug: string;
  access_token?: string;
  refresh_token?: string;
  email: string;
  user_info: object;
  inbound_storage: number;
  last_processed?: string;
  expired_at?: string;
  created_at: string | null;
  updated_at: string | null;
  is_deleted: number;
};

export type ResponseUserGmailAccount = Omit<UserGmailAccount, "is_deleted">;
export type ResponseUserGmailAccountList = ResponseUserGmailAccount[];
