export type CreateChatCompletionRequest = {
  model: string;
  messages: ChatCompletionRequestMessage[];
  functions?: ChatCompletionFunctions[];
  function_call?: CreateChatCompletionRequestFunctionCall;
  temperature?: number | null;
  top_p?: number | null;
  n?: number | null;
  stream?: boolean | null;
  stop?: CreateChatCompletionRequestStop;
  max_tokens?: number;
  presence_penalty?: number | null;
  frequency_penalty?: number | null;
  logit_bias?: object | null;
  user?: string;
};

export type CreateChatCompletionRequestStop = string[] | string;

export type ChatCompletionRequestMessageRoleEnum =
  | "function"
  | "system"
  | "user"
  | "assistant";

export type ChatCompletionRequestMessageFunctionCall = {
  name?: string;
  arguments?: string;
};

export type ChatCompletionRequestMessage = {
  role: ChatCompletionRequestMessageRoleEnum;
  content?: string;
  name?: string;
  function_call?: ChatCompletionRequestMessageFunctionCall;
};

export type ChatCompletionFunctions = {
  name: string;
  description?: string;
  parameters?: {
    [key: string]: any;
  };
};

export type CreateChatCompletionRequestFunctionCallOneOf = {
  name: string;
};
export type CreateChatCompletionRequestFunctionCall =
  | CreateChatCompletionRequestFunctionCallOneOf
  | string;

export type CreateChatCompletionResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: CreateChatCompletionResponseChoicesInner[];
  usage?: CreateCompletionResponseUsage;
};

export type CreateChatCompletionResponseChoicesInner = {
  index?: number;
  message?: ChatCompletionResponseMessage;
  finish_reason?: string;
};

export type ChatCompletionResponseMessageRoleEnum =
  | "function"
  | "system"
  | "user"
  | "assistant";

export type ChatCompletionResponseMessage = {
  role: ChatCompletionResponseMessageRoleEnum;
  content?: string;
  function_call?: ChatCompletionRequestMessageFunctionCall;
};

export type CreateCompletionResponseUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};
