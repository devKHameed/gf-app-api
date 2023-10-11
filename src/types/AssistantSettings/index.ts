export type AssistantSettings = {
  id: string;
  slug: string;
  name: string;
  idle_delay_time: number; // (DEFAULT 62) //int in seconds
  idle_close_time: number; // (DEFAULT 61) //int in seconds
  start_delay_time: number; //  (DEFAULT 2) //int in seconds
  yellow_delay_time: number; // (DEFAULT 3) //int in seconds
  red_delay_time: number; //  (DEFAULT 2) //int in seconds
  idle_checkin_message: AssistantMessages[]; //AN Array of Strings. They need to support short codes . You guys decide how we format them EG {{FOO}} OR [FOO] etc.
  idle_close_message: AssistantMessages[]; //AN Array of Strings. They need to support short codes . You guys decide how we format them EG {{FOO}} OR [FOO] etc.
  first_greeting_message: AssistantMessages[]; //AN Array of Strings. They need to support short codes . You guys decide how we format them EG {{FOO}} OR [FOO] etc.
  return_greeting_message: AssistantMessages[]; //AN Array of Strings. They need to support short codes . You guys decide how we format them EG {{FOO}} OR [FOO] etc.
  assistant_shortcodes: AssistantSortCode[]; //an array of objects, each object will contain a title, description and slug.
  created_at: string;
  updated_at: string;
  is_default: boolean;
  is_deleted: boolean;
};

export type AssistantMessages = { message: string };
export type AssistantSortCode = {
  title: string;
  description: string;
  slug: string;
};
