import { envTableNames } from "../../../config";
import { dynamodb } from "../../../helpers/db";
import { SylarSessionMessage } from "../../../types/Sylar";

type GetSessionMessagesParams = {
  accountSlug: string;
  userSlug: string;
  sessionSlug: string;
};

export const getSessionMessages = async (params: GetSessionMessagesParams) => {
  const { accountSlug, userSlug, sessionSlug } = params;

  const { Items: messages } = await dynamodb.query({
    TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_MESSAGES,
    KeyConditionExpression: "#id = :id",
    ExpressionAttributeNames: {
      "#id": "id",
    },
    ExpressionAttributeValues: {
      ":id": `${accountSlug}:${userSlug}:${sessionSlug}`,
    },
  });

  return messages as SylarSessionMessage[];
};

type CreateSessionMessageParams = {
  accountSlug: string;
  userSlug: string;
  sessionSlug: string;
  messageType: "SYLAR" | "AGENT";
  message: string;
} & Partial<SylarSessionMessage>;

export const createSessionMessage = async (
  params: CreateSessionMessageParams
) => {
  const {
    accountSlug,
    userSlug,
    sessionSlug,
    messageType,
    message,
    ...sessionMessage
  } = params;

  const item: SylarSessionMessage = {
    id: `${accountSlug}:${userSlug}:${sessionSlug}`,
    slug: `${Date.now()}:${messageType}`,
    created_at: `${Date.now()}`,
    is_open: 1,
    by_sylar: messageType === "SYLAR",
    chatgpt: messageType === "SYLAR",
    meta_data: {
      message: message,
    },
    is_deleted: 0,
    ...sessionMessage,
  };

  await dynamodb.put({
    TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_MESSAGES,
    Item: item,
  });

  return item;
};
