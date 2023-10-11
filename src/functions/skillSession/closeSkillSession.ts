import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import { AWSError } from "aws-sdk/lib/error";
import { default as createError } from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account, AccountUser } from "types";
import { SkillSession } from "types/Skill";
import { ACCOUNT_SKILL_SESSION_TABLE_NAME } from "../../config";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        note: {
          type: "string",
        },
      },
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { note } = event.body;
  const session_id = event.pathParameters?.session_id;
  // const account_id: string = event.headers["account-id"] as string;
  const user = (event as any).user as AccountUser;
  const account = (event as any).account as Account;
  const databaseName = account.database_name;
  if (!user.slug) throw createError("invalid params");

  try {
    const connectionKnex = await connectKnex(databaseName);

    await connectionKnex<SkillSession>(ACCOUNT_SKILL_SESSION_TABLE_NAME)
      .update({
        end_date_time: new Date(),
        status: "Closed",
        note: note,
      })
      .where("session_id", session_id);

    return {
      statusCode: 201,
      body: { message: "data updated" },
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
