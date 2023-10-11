export type Contact = {
  id: string;
  slug: string;
  data: ContactData;
  contact_types: string[];
  type_data: object;
  contact_tags: Array<string>;
  created_at: string | null;
  updated_at: string | null;
  is_deleted: number;
};

export type ContactData = {
  [key: string]: any;
};

export type ContactListRule = {
  id: string;
  slug: string;
  types_to_include: string[];
  tags_to_include: string[];
};

export type ContactListAgg = {
  id: string;
  slug: string;
  contact_id_rule_id: string;
  contact_data: Record<string, unknown>;
};

export type ResponseContact = Omit<Contact, "is_deleted">;
export type ResponseContactList = ResponseContact[];
