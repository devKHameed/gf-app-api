export type SocTask = {
  id: string;
  slug: string;
  device_id: string;
  account_type: string;
  event_type_id: string;
  event_status: string;
  event_type_instructions: string | object;
  event_type_results: string | object;
  event_start_date: string;
  event_complete_date: string;
  event_schedule_date: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseSocTask = Omit<SocTask, "is_deleted">;
export type ResponseSocTaskList = ResponseSocTask[];
