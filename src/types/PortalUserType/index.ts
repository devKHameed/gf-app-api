export type PortalUserType = {
  id: string;
  slug: string;
  is_public: boolean;
  name: string;
  description: string;
  variations: object;
  media: object;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponsePortalUserType = Omit<PortalUserType, "is_deleted">;
export type ResponsePortalUserTypeList = ResponsePortalUserType[];
