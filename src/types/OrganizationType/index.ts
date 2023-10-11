export type OrganizationType = {
  id: string;
  slug: string;
  name: string;
  color: string;
  fields: object;
  created_at: string | null;
  updated_at: string | null;
  is_deleted: number;
};

export type ResponseOrganizationType = Omit<OrganizationType, "is_deleted">;
export type ResponseOrganizationTypeList = ResponseOrganizationType[];
