export type GFContact = {
  id: string;
  slug: string;
  primary_email: string;
  primary_phone: string;
  first_name: string;
  last_name: string;
  all_emails: object;
  all_phones: object;
  country: string;
  profile_image: string;
  mailing_address: object;
  is_universal: boolean;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type GFContactTag = {
  slug: number;
  contact_id: string;
  tag_value: string;
};

export type ResponseGFContact = Omit<GFContact, "is_deleted">;
export type ResponseGFContactList = ResponseGFContact[];
