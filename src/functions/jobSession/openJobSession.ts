import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import { default as createError } from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account, AccountUser } from "types";
import { JobSession } from "types/Job";
import {
  ACCOUNT_JOB_SESSION_DATA_TABLE_NAME,
  ACCOUNT_JOB_SESSION_TABLE_NAME,
  envTableNames,
} from "../../config";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        note: {
          type: "string",
        },
        title: {
          type: "string",
        },
        related_skill_id: { type: "string" },
        session_data: { type: "object" },
        skill_session_id: { type: "number" },
      },
      required: ["related_skill_id", "title", "skill_session_id"], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { note, title, skill_session_id, related_skill_id, session_data } =
    event.body;

  const account_id: string = event.headers["account-id"] as string;
  const user = (event as any).user as AccountUser;
  const account = (event as any).account as Account;
  const databaseName = account.database_name;
  if (!user.slug) throw createError("invalid params");

  try {
    const connectionKnex = await connectKnex(databaseName);

    const [session_id] = await connectionKnex<JobSession>(
      ACCOUNT_JOB_SESSION_TABLE_NAME
    )
      .insert({
        account_id,
        user_id: user.slug,
        related_skill_id,
        skill_session_id,
        title,
        start_date_time: new Date(),
        status: "Open",
        note: note,
      })
      .returning("session_id");

    const params: DynamoDB.DocumentClient.PutItemInput = {
      TableName: envTableNames.DYNAMODB_JOB_SESSION_DATA,
      Item: {
        id: `${account_id}${ACCOUNT_JOB_SESSION_DATA_TABLE_NAME}`,
        slug: session_id,
        session_data,
        related_skill_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: 1,
        is_deleted: 0,
      },
    };

    await dynamoDb.put(params).promise();

    return {
      statusCode: 201,
      body: { data: params.Item },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
  .use(jsonschemaErrors())
  .use(httpErrorHandler())
  .use(getUser())
  .use(getAccountData())
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
