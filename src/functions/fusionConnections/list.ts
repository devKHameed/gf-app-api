import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import {
  default as createError,
  default as createHttpError,
} from "http-errors";
import jwt from "jsonwebtoken";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { AccountUser } from "types";
import { envTableNames, SYSTEM_USERS } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamodb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_SYS_USERS_TABLE;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
    },
  },
  required: ["body"],
} as const;

const tableName = `${envTableNames.DYNAMODB_ACCT_FUSION_CONNECTION}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const {
      headers: { authorization },
    } = event;
    const token = authorization!.replace("Bearer ", "");
    const tUser = jwt.decode(token) as { email: string };

    const { Items: users } = await dynamodb
      .query({
        TableName: TABLE_NAME,
        IndexName: "email_lsi_index",
        KeyConditionExpression: "#id = :id AND #email = :email",
        ExpressionAttributeNames: {
          "#id": "id",
          "#email": "email",
        },
        ExpressionAttributeValues: {
          ":id": SYSTEM_USERS,
          ":email": tUser.email,
        },
        ProjectionExpression:
          "id, slug, email, phone, first_name, last_name, created_at, updated_at, is_deleted",
      })
      .promise();
    const User = users?.[0] as AccountUser;

    if (!User?.slug) throw createError("user does not exists!");

    const accountId = event.headers["account-id"];
    const { app_id = "" } = event.pathParameters || {};
    const isUser = event.queryStringParameters?.isUser || "false";

    let Items;

    if (isUser === "true") {
      Items = await dynamodb
        .query({
          TableName: tableName,
          FilterExpression: "#is_deleted = :is_deleted AND #user_id = :user_id",
          KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
          ExpressionAttributeNames: {
            "#id": "id",
            "#is_deleted": "is_deleted",
            "#slug": "slug",
            "#user_id": "user_id",
          },
          ExpressionAttributeValues: {
            ":id": `${accountId}:fusion_connections`,
            ":is_deleted": false,
            ":slug": app_id,
            ":user_id": User.slug,
          },
        })
        .promise();
    } else {
      Items = await dynamodb
        .query({
          TableName: tableName,
          FilterExpression:
            "#is_deleted = :is_deleted AND (#user_id = :user_id OR #is_user = :is_user)",
          KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
          ExpressionAttributeNames: {
            "#id": "id",
            "#is_deleted": "is_deleted",
            "#slug": "slug",
            "#user_id": "user_id",
            "#is_user": "is_user",
          },
          ExpressionAttributeValues: {
            ":id": `${accountId}:fusion_connections`,
            ":is_deleted": false,
            ":slug": app_id,
            ":user_id": User.slug,
            ":is_user": false,
          },
        })
        .promise();
    }

    return {
      statusCode: 200,
      body: { data: Items.Items, count: Items.Count },
    };
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  // .use(validator({ eventSchema })) // validates the input
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
