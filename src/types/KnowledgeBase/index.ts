export type KnowledgeBase = {
  id: string;
  slug: string;
  name: string;
  faq: Array<Record<string, any>>;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseKnowledgeBase = Omit<KnowledgeBase, "is_deleted">;
export type ResponseKnowledgeList = ResponseKnowledgeBase[];
