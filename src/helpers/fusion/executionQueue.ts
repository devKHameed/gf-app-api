import { envTableNames } from "../../config";
import { dynamodb, queryAll } from "../../helpers/db";
import { sleep } from "../../util/index";

export type QueueItem = {
  id: string; // session slug
  slug: string; // branch_id:unique identifier
  operator_id: string;
  inputs: Record<string, unknown>;
  index: number;
  branch_id?: string;
  responses?: Record<
    string,
    {
      responseUrl: string;
      index?: number;
      is_loop_operator?: boolean;
      [x: string]: unknown;
    }
  >;
};

export const getNextQueueItem = async (
  sessionSlug: string,
  slugPrefix?: string
) => {
  if (!slugPrefix) {
    const { Items = [] } = await dynamodb.query({
      TableName: envTableNames.DYNAMODB_ACCT_FUSION_SESSION_V2,
      KeyConditionExpression: "id = :id",
      ExpressionAttributeValues: {
        ":id": sessionSlug,
      },
      Limit: 1,
      ScanIndexForward: false,
    });

    return Items[0] as QueueItem;
  } else {
    const { Items = [] } = await dynamodb.query({
      TableName: envTableNames.DYNAMODB_ACCT_FUSION_SESSION_V2,
      KeyConditionExpression: "id = :id AND begins_with(slug, :slug)",
      ExpressionAttributeValues: {
        ":id": sessionSlug,
        ":slug": slugPrefix,
      },
      Limit: 1,
      ScanIndexForward: false,
    });

    return Items[0] as QueueItem;
  }
};

export const getNextQueueItems = async (
  sessionSlug: string,
  slugPrefix: string
) => {
  const { Items = [] } = await dynamodb.query({
    TableName: envTableNames.DYNAMODB_ACCT_FUSION_SESSION_V2,
    KeyConditionExpression: "id = :id AND begins_with(slug, :slug)",
    ExpressionAttributeValues: {
      ":id": sessionSlug,
      ":slug": slugPrefix,
    },
    ScanIndexForward: false,
  });

  return Items as QueueItem[];
};

export const getExecutionQueue = async (sessionSlug: string) => {
  return await queryAll<QueueItem>({
    TableName: envTableNames.DYNAMODB_ACCT_FUSION_SESSION_V2,
    KeyConditionExpression: "id = :id",
    ExpressionAttributeValues: {
      ":id": sessionSlug,
    },
  });
};

export const insertQueueItems = async (queueItems: QueueItem[]) => {
  const RETRY_LIMIT = 3;

  for (const item of queueItems) {
    let retried = 0;
    while (retried < RETRY_LIMIT) {
      try {
        await dynamodb.put({
          TableName: envTableNames.DYNAMODB_ACCT_FUSION_SESSION_V2,
          Item: item,
        });
        break;
      } catch (e) {
        console.log(
          "🚀 ~ file: executionQueue.ts:56 ~ insertQueueItems ~ e:",
          e
        );
        retried++;
        if (retried === RETRY_LIMIT) {
          throw e;
        }
        await sleep(1000);
      }
    }
  }
};

export const removeQueueItem = async (
  sessionSlug: string,
  queueSlug: string
) => {
  await dynamodb.delete({
    TableName: envTableNames.DYNAMODB_ACCT_FUSION_SESSION_V2,
    Key: {
      id: sessionSlug,
      slug: queueSlug,
    },
  });
};

export const updateQueueItem = async (
  sessionSlug: string,
  slug: string,
  item: Partial<QueueItem>
) => {
  const updates = Object.entries(item).reduce<{
    expression: string[];
    values: Record<string, unknown>;
    names: Record<string, string>;
  }>(
    (acc, [key, value], idx) => {
      acc.expression.push(`#${idx} = :${idx}`);
      acc.values[`#${idx}`] = value;
      acc.values[`:${idx}`] = key;

      return acc;
    },
    { expression: [], values: {}, names: {} }
  );

  if (updates.expression.length > 0) {
    await dynamodb.update({
      TableName: envTableNames.DYNAMODB_ACCT_FUSION_SESSION_V2,
      Key: {
        id: sessionSlug,
        slug,
      },
      UpdateExpression: `SET ${updates.expression.join(",")}`,
      ExpressionAttributeValues: updates.values,
      ExpressionAttributeNames: updates.names,
    });
  }
};
