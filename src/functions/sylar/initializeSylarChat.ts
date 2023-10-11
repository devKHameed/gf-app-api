import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { AccountUser } from "types";
import { envTableNames } from "../../config";
import { EVENT_TYPES } from "../../constants/event";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
const dynamodb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
    },
  },
  required: ["body"],
} as const;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const accountId = event.headers["account-id"];
  const user = event.user as AccountUser;

  const nowDate = new Date().toISOString();

  const slug = `ISOPEN:is_deleted:${Date.now()}`;

  const sylarSessionParams = {
    TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_SESSION,
    Item: {
      id: `${accountId}:${user.slug}`,
      slug: slug,
      created_at: nowDate,
      closed_at: null,
      is_open: 1,
      meta_data: {
        active_skill_session: "none",
      },
      is_deleted: 0,
    },
  };
  const sylarChatLogsParams = {
    TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_LOGS,
    Item: {
      id: `${accountId}:${user.slug}:${slug}`,
      slug: `${nowDate}:${EVENT_TYPES.CREATED}`,
      event_type: EVENT_TYPES.CREATED,
      created_at: nowDate,
      meta_data: {},
    },
  };

  try {
    await Promise.all([
      dynamodb.put(sylarSessionParams).promise(),
      dynamodb.put(sylarChatLogsParams).promise(),
    ]);
    return {
      statusCode: 200,
      body: { data: sylarSessionParams.Item },
    };
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
};

export const handler = middy()
  .use(getUser())
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
  .use(
    httpResponseSerializer({
      serializers: [
        {
          regex: /^application\/json$/,
          serializer: ({ body }: any) => JSON.stringify(body),
        },
      ],
      defaultContentType: "application/json",
    })
  ) // handles common http errors and returns proper responses
  .handler(lambdaHandler);
