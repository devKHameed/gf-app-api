import Stripe from "stripe";
import { AccountReponse } from "../index";

export type AccountUser = {
  id: string;
  slug: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  subscription?: Record<string, any>;
  password: string | null;
  stripe_customer?: Stripe.Customer;
  account_data: Record<string, any>;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
  is_online: boolean;
  on_duty: boolean;
  image?: Record<string, unknown>;
};

export type ResponseAccountUser = {
  user: Omit<AccountUser, "is_deleted">;
  accounts: AccountReponse;
};
export type ResponseAccountUserList = Omit<AccountUser, "is_deleted">[];
