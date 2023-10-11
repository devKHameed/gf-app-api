import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account } from "types";
import { JobSession } from "types/Job";
import { ACCOUNT_JOB_SESSION_TABLE_NAME } from "../../config";
import connectKnex from "../../helpers/knex/connect";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const session_id = event.pathParameters?.session_id;
  const account = (event as any).account as Account;
  const databaseName = account.database_name;

  try {
    const connectionKnex = await connectKnex(databaseName);

    const jobSession = await connectionKnex<JobSession>(
      ACCOUNT_JOB_SESSION_TABLE_NAME
    )
      .where("session_id", session_id)
      .first();

    return {
      statusCode: 200,
      body: { data: jobSession },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy(lambdaHandler)
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
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
  .handler(lambdaHandler);
