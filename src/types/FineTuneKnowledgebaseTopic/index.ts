export type FineTuneKnowledgebaseTopic = {
  id: string;
  slug: string;
  name: string;
  meta_data: object;
  value: string;
  description: string;
  question: string;
  answer: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseFineTuneKnowledgebaseTopic = Omit<
  FineTuneKnowledgebaseTopic,
  "is_deleted"
>;
export type ResponseFineTuneKnowledgebaseTopicList =
  ResponseFineTuneKnowledgebaseTopic[];
