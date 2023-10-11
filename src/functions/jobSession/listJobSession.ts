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
import getAccountData from "../../middleware/getAccountData";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const account = (event as any).account as Account;
  const databaseName = account.database_name;
  const skillSessionId = event.queryStringParameters?.skill_session_id;
  const skillDesignSlug = event.queryStringParameters?.skill_design_slug;

  try {
    const connectionKnex = await connectKnex(databaseName);

    const jobSessions = await connectionKnex<JobSession>(
      ACCOUNT_JOB_SESSION_TABLE_NAME
    )
      .orderBy("start_date_time", "desc")
      .where((builder) => {
        if (skillSessionId) {
          void builder.where("skill_session_id", skillSessionId);
        }

        if (skillDesignSlug) {
          void builder.where("related_skill_id", skillDesignSlug);
        }
      });

    return {
      statusCode: 200,
      body: { message: "List of job sessions", data: jobSessions },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
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
  ) // handles common http errors and returns proper responses
  .handler(lambdaHandler);
