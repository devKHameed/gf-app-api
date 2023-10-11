import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account } from "types";
import { Media } from "types/Media";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
    },
  },
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const account = event.account as Account;
  const id = event.pathParameters!.id;

  if (!id) {
    throw createError(400, "Missing id");
  }

  try {
    if (account.database_name) {
      const connectionKnex = await connectKnex(account.database_name);

      await connectionKnex<Media>("media")
        .update({ is_deleted: 1 })
        .where({ id: Number(id) });

      return {
        statusCode: 200,
        body: {
          message: "Data deleted",
        },
      };
    } else {
      throw new Error("database does not exists");
    }
  } catch (error: unknown) {
    console.log("error---", error);
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(getAccountData())
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
