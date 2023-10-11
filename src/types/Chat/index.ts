import { AccountUser } from "types/User";

export type SessionStatus = "browsing" | "open" | "closed";

export type ChatConnection = {
  id: string;
  slug: string;
  start_day_time: string;
  recent_session: string;
  session_status: SessionStatus;
  internal_meta: {
    geolocation: {
      city?: string;
      country?: string;
      ip?: string;
      lat?: number;
      lng?: number;
      os?: string;
    };
    name: string;
    email: string;
    phone: string;
    contact_data: Record<string, unknown>;
  };
  external_meta: {
    user_data?: {
      first_name: string;
      last_name: string;
      email: string;
      phone: string;
      slug: string;
    };
  };
  public_contact_id: string;
  created_at: string;
  updated_at: string;
  is_active: number;
  is_deleted: number;
  secondary_operators?: string[];
  chat_risk_status?: "GREEN" | "YELLOW" | "RED";
};

export type ChatSession = {
  id: string;
  slug: string;
  start_day_time: string;
  end_day_time: string;
  session_status: SessionStatus;
  primary_operator: string;
  created_at: string;
  updated_at: string;
  is_active: number;
  is_deleted: number;
};

export type ChatEvent = {
  id: string;
  slug: string;
  date_time: number;
  event_type: string;
  created_by: string;
  is_bot: boolean;
  event_creator: string;
  event_data: Record<string, unknown>;
  is_active: number;
  is_deleted: number;
  created_at: string;
  updated_at: string | null;
  creator_data: Record<string, unknown>;
};

export type ChatAccessList = {
  id: string;
  slug: string;
  internal_meta: {
    geolocation: {
      city?: string;
      country?: string;
      ip?: string;
      lat?: number;
      lng?: number;
      os?: string;
    };
    user_data?: {
      name: string;
      email: string;
      phone: string;
      contact_data: Record<string, unknown>;
    };
  };
  external_meta: {
    user_data?: {
      first_name: string;
      last_name: string;
      email: string;
      phone: string;
      slug: string;
    };
  };
  user_data?: AccountUser;
  role: "agent" | "manager";
  chat_connection_id: string;
  account_id: string;
  date_time: number;
  created_at: string;
  updated_at: string;
  is_active: number;
  is_deleted: number;
  session_status?: string;
};
