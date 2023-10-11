export type Session = {
  id: string;
  slug: string;
  start_day_time: string;
  end_day_time: string;
  session_status: string;
  primary_operator: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseSession = Omit<Session, "is_deleted">;
export type ResponseSessionList = ResponseSession[];
