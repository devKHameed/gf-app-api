export type ContactType = {
  id: string;
  slug: string;
  name: string;
  color: string;
  fields: object;
  created_at: string | null;
  updated_at: string | null;
  is_deleted: number;
};

export type ResponseContactType = Omit<ContactType, "is_deleted">;
export type ResponseContactTypeList = ResponseContactType[];
