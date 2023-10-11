export type SkillIntent = {
  id: string;
  slug: string;
  intent: string;
  icon: string;
  skill_id: string;
  created_at: string;
  updated_at: string | null;
  is_deleted: number;
};
interface SkillSession {
  account_id: string;
  user_id: string;
  session_id: number; // primary key and auto incrementing
  skill_id: string;
  start_date_time: Date;
  end_date_time?: Date; // This is marked as optional because it might not be set when a record is initially created
  status: "Open" | "Closed";
  note?: string; // Optional as it may not always be provided
}
interface SkillSessionData {
  id: string;
  slug: string;
  session_data: Record<string, any>; // primary key and auto incrementing
}
