export type VectorKnowledgebaseTopic = {
  id: string;
  slug: string;
  name: string;
  meta_data: object;
  value: string;
  description: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseVectorKnowledgebaseTopic = Omit<
  VectorKnowledgebaseTopic,
  "is_deleted"
>;
export type ResponseVectorKnowledgebaseTopicList =
  ResponseVectorKnowledgebaseTopic[];
