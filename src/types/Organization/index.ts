export type Organization = {
  id: string;
  slug: string;
  data: OrganizationData;
  type_id: string;
  name: string;
  created_at: string | null;
  updated_at: string | null;
  is_deleted: number;
};

export type OrganizationData = {
  [key: string]: any;
};

export type ResponseOrganization = Omit<Organization, "is_deleted">;
export type ResponseOrganizationList = ResponseOrganization[];
