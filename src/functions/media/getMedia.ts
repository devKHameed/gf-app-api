import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account } from "types";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const id = event.pathParameters!.id;

  if (!id) {
    throw createError(400, "Missing id");
  }

  const account = (event as any).account as Account;
  const databaseName = account.database_name;

  try {
    if (databaseName) {
      const connectionKnex = await connectKnex(account.database_name);

      const query = connectionKnex("media").select("*").where("id", id);

      console.log({ query: query.toSQL().toNative() });

      const [result] = await query;

      return {
        statusCode: 200,
        body: {
          message: "List of media ",
          data: result,
        },
      };
    }

    return {
      statusCode: 200,
      body: { message: "List of datasets", data: [] },
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
  )
  .handler(lambdaHandler); // handles common http errors and returns proper responses
