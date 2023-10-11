export type VectorKnowledgebase = {
  id: string;
  slug: string;
  pinecone_index: string;
  name: string;
  description: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseVectorKnowledgebase = Omit<
  VectorKnowledgebase,
  "is_deleted"
>;
export type ResponseVectorKnowledgebaseList = ResponseVectorKnowledgebase[];
