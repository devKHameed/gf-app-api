export type Connection = {
  id: string;
  slug: string;
  start_day_time: string;
  recent_session: string;
  session_status: string;
  internal_meta: object;
  external_meta: object;
  public_contact_id: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseConnection = Omit<Connection, "is_deleted">;
export type ResponseConnectionList = ResponseConnection[];
