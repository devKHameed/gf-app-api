export type Document = {
  id: string;
  slug: string;
  title: string;
  fields: DocumentField[];
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};
export type DocumentField = {
  [key: string]: any;
};

export type ResponseDocument = Omit<Document, "is_deleted">;
export type ResponseDocumentList = ResponseDocument[];
