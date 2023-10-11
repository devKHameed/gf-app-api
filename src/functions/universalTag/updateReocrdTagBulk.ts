import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { UniversalTag } from "types";
import { envTableNames } from "../../config";
import { dynamodb } from "../../helpers/db";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { AccountUser } from "../../types";
import { UniversalEvent } from "../../types/UniversalEvent";
import { createUniversalEvent } from "../universalEvent/createUniversalEvent";

const tableName = envTableNames.DYNAMODB_ACCT_UNIVERSAL_TAGS;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        record_type: {
          type: "string",
        },
        tags: {
          type: "array",
        },
      },
      required: ["record_type", "tags"],
    },
  },
  required: ["body"],
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { record_type, tags } = event.body;
  const account_id: string = event.headers["account-id"] as string;
  const user = event.user as AccountUser;

  try {
    for (const itm of tags as UniversalTag[]) {
      if (itm.action == "add") {
        await createUniversalTag(
          account_id,
          record_type,
          itm.record_id,
          itm.tag,
          itm.color,
          user.slug
        );

        await createUniversalEvent({
          recordId: itm.record_id,
          recordType: record_type,
          accountId: account_id,
          eventSlug: "add_tag",
          eventData: {
            tag: itm.tag,
            user_id: user.slug,
            date_time: Date.now(),
            color: itm.color,
          },
          userId: "",
        });
      } else if (itm.action == "remove") {
        await deleteUniversalTag(
          account_id,
          record_type,
          itm.record_id,
          itm.tag
        );

        await createUniversalEvent({
          recordId: itm.record_id,
          recordType: record_type,
          accountId: account_id,
          eventSlug: "remove_tag",
          eventData: {
            tag: itm.tag,
            user_id: user.slug,
            date_time: Date.now(),
          },
          userId: "",
        });
      } else {
        throw createError(400, "invalid action");
      }
    }

    return {
      statusCode: 200,
      body: { message: "update successful" },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const createUniversalTag = async (
  accountId: string,
  recordType: string,
  recordId: string,
  tag: string,
  color: string,
  userId: string
) => {
  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: tableName,
    Item: {
      id: `${accountId}:${recordType}`,
      slug: `${recordId}:${tag}`,
      tag_user_id_idx: `${tag}:${userId}`,
      record_id: recordId,
      record_type: recordType,
      color: color,
      user_id: userId,
      tag,
      created_at: new Date().toISOString(),
      updated_at: null,
    },
  };

  await dynamodb.put(params);

  return params.Item as UniversalEvent;
};

export const deleteUniversalTag = async (
  accountId: string,
  recordType: string,
  recordId: string,
  tag: string
) => {
  const params: DynamoDB.DocumentClient.DeleteItemInput = {
    TableName: tableName,
    Key: {
      id: `${accountId}:${recordType}`,
      slug: `${recordId}:${tag}`,
    },
  };

  await dynamodb.delete(params);
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
  .use(getUser())
  .use(jsonschemaErrors())
  .use(httpErrorHandler())
  .use(
    responseSerializer({
      serializers: [
        {
          regex: /^application\/json$/,
          serializer: ({ body }: any) => JSON.stringify(body),
        },
      ],
      defaultContentType: "application/json",
    })
  )
  .handler(lambdaHandler); // handles common http errors and returns proper responses
