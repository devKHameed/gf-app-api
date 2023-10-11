export type ChatQueue = {
  id: string;
  slug: string;
  title: string;
  assign_to_users: { user: string; role: string }[];
  assign_to_user_types: { user_type: string; role: string }[];
  rules: Array<string>;
  created_at: string | null;
  updated_at: string | null;
  is_active: number;
  is_deleted: number;
};

export type ResponseChatQueue = Omit<ChatQueue, "is_deleted">;
export type ResponseChatQueueList = ResponseChatQueue[];
