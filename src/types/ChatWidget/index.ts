export type ChatWidget = {
  id: string;
  slug: string;
  title: string;
  chat_queue_id: string;
  contact_automations: Array<string>;
  contact_type_id: string;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
  knowledgebase_id: string;
};

export type ResponseChatWidget = Omit<ChatWidget, "is_deleted">;
export type ResponseChatWidgetList = ResponseChatWidget[];
