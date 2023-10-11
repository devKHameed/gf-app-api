export type Compaign = {
  id: string;
  slug: string;
  name: string;
  fields: object;
  status: object;
  trigger_events: object;
  assc_contact_type: string;
  flow: object;
  events: object;
  created_at: string | null;
  updated_at: string | null;
  is_deleted: number;
};

export type ResponseCompaign = Omit<Compaign, "is_deleted">;
export type ResponseCompaignList = ResponseCompaign[];
