export type SocketConnection = {
  id: string;
  slug: string;
  user_id: string;
  last_ping: number;
  metadata: { [key: string]: any };
  created_at: string | null;
  updated_at: string | null;
  is_active: boolean;
};
