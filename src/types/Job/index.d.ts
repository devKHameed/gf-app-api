export interface JobSession {
  session_id: number;
  account_id: string;
  user_id: string;
  job_id: number; // primary key and auto incrementing
  related_skill_id: string;
  skill_session_id: number;
  start_date_time: Date;
  end_date_time?: Date; // This is marked as optional because it might not be set when a record is initially created
  status: "Open" | "Closed" | "Awaiting Instruction" | "Cancelled";
  title?: string; // Optional as it may not always be provided
  note?: string; // Optional as it may not always be provided
}
export interface JobSessionData {
  id: string;
  slug: string;
  session_data: Record<string, any>; // primary key and auto incrementing
}
