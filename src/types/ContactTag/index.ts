export type ContactTag = {
  id: string;
  slug: string;
  tag: string;
  contact_slug: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseContactTag = Omit<ContactTag, "is_deleted">;
export type ResponseContactTagList = ResponseContactTag[];
