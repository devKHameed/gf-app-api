export type GFApp = {
  id: string;
  slug: string;
  name: string;
  color: string;
  language: string;
  audience: string;
  description: string;
  current_version: string;
  child_gui: childGui;
  child_fusions: childFusions;
  required_plugins: requiredPlugins;
  associated_documents: associatedDocuments;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type childGui = {
  [key: string]: any;
};

export type childFusions = {
  [key: string]: any;
};

export type requiredPlugins = {
  [key: string]: any;
};

export type associatedDocuments = {
  [key: string]: any;
};

export type ResponseGFApp = Omit<GFApp, "is_deleted">;
export type ResponseGFAppList = ResponseGFApp[];
