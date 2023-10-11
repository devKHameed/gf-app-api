export type CompaignExe = {
  id: string;
  slug: string;
  name: string;
  fields: object;
  status: object;
  trigger_event: object;
  assc_contact_id: string;
  flow: object;
  events: object;
  created_at: string | null;
  updated_at: string | null;
  is_deleted: number;
};
export type ResponseCompaignExe = Omit<CompaignExe, "is_deleted">;
export type ResponseCompaignExeList = ResponseCompaignExe[];
