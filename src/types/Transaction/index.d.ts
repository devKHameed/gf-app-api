export interface TransactionHistory {
  title: string;
  description: string;
  credited: number;
  debited: number;
  credit_type_id: string;
  package_id: string;
  stripe_transaction_id: string;
  stripe_amount: number;
  user_id: string;
}

export interface AccountCredit {
  credit_type_id: string;
  credits_available: number;
  credits_in_progress: number;
  created_at: string;
}
