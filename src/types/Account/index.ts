import Stripe from "stripe";

export type Account = {
  id: string;
  slug: string;
  status: "ACTIVE" | "INACTIVE" | "AT_RISK" | "OERDUE";
  database_name: string;
  account_slug: string;
  name: string;
  startup_fee: number;
  monthly_fee: number;
  app_user_settings: Record<string, unknown>;
  user_limit_settings: Record<string, unknown>;
  operation_settings: Record<string, unknown>;
  contact_settings: Record<string, unknown>;
  project_settings: Record<string, unknown>;
  dynamo_storage_settings: Record<string, unknown>;
  fusion_settings: {
    concurrency_limit: number;
  };
  sql_storage_settings: Record<string, unknown>;
  chat_settings: Record<string, unknown>;
  three_p_app_settings: Record<string, unknown>;
  stripe_card?: (Stripe.Card & { primary?: boolean })[];
  account_type_slug: string | Account;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
  company_name?: string;
  primary_color?: string;
  logo?: string;
  logo_square?: string;
  default_price_per_chat?: string;
  is_agent: number;
  usage_credits?: number;
  chat_credits?: number;
  operator_credits?: number;
  max_fusion_branches?: number;
  active_fusion_branches?: number;
  max_credits?: number;
  stripe_sources: Record<string, unknown>[];
  stripe_customer: Record<string, unknown>;
  payment_status?: string;
  account_package_id: string;
};

export type AccountReponse = Omit<Account, "is_deleted">;
export type AccountReponseList = AccountReponse[];

export type CreditTypes = {
  id: string;
  slug: string;
  name: string;
  description: string;
  default_startup_qty: number;
  default_monthly_qty: number;
  default_additional_qty: number;
  default_additional_increment: number;
  is_active: 0 | 1;
  is_deleted: 0 | 1;
};
export type SeatTypes = {
  id: string;
  slug: string;
  name: string;
  description: string;
  default_startup_qty: number;
  default_monthly_qty: number;
  default_additional_qty: number;
  default_additional_increment: number;
  is_active: 0 | 1;
  is_deleted: 0 | 1;
};
export type Package = {
  id: string;
  slug: string;
  name: string;
  description: string;
  startup_qty: number;
  monthly_qty: number;
  additional_qty: number;
  additional_increment: number;
  pass_phrase: string;
  enable_pass: boolean;
  is_active: 0 | 1;
  is_deleted: 0 | 1;
};
export type PackageCreditSetting = {
  id: string;
  slug: string;
  name: string;
  description: string;
  startup_qty: number;
  monthly_qty: number;
  additional_cost: number;
  additional_increment: number;
  credit_id: string;
  is_active: 0 | 1;
  is_deleted: 0 | 1;
};
export type PackageSeatSetting = {
  id: string;
  slug: string;
  name: string;
  description: string;
  startup_qty: number;
  monthly_qty: number;
  additional_cost: number;
  additional_increment: number;
  seat_id: string;
  is_active: 0 | 1;
  is_deleted: 0 | 1;
};

export type AccountCredit = {
  credit_type_id: string;
  credits_available: number;
  credits_in_progress: number;
  created_at: string;
  updated_at: string;
};
