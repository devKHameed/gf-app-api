import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account } from "types";
import { TransactionHistory } from "types/Transaction";
import { TRANSACTION_HISTORY } from "../../config";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const account = (event as any).account as Account;
  const databaseName = account.database_name;
  const accountId: string = event.headers["account-id"] as string;
  const creditTypeId = event.queryStringParameters?.credit_type_id;

  const limit = event.queryStringParameters?.limit
    ? parseInt(event.queryStringParameters?.limit)
    : 0;
  const offset = event.queryStringParameters?.offset
    ? parseInt(event.queryStringParameters?.offset)
    : 0;

  try {
    if (databaseName) {
      console.log("databaseName", databaseName);
      const connectionKnex = await connectKnex(account.database_name);

      let query = connectionKnex<TransactionHistory>(TRANSACTION_HISTORY).where(
        (builder) => {
          if (creditTypeId) void builder.where("credit_type_id", creditTypeId);
        }
      );

      if (limit) {
        query = query.limit(limit);
      }

      if (offset) {
        query = query.offset(offset);
      }
      // const { sql, bindings } = query.toSQL();
      // console.log("query before");
      const data = (await query) as unknown as TransactionHistory[];
      // console.log("query", data);

      return {
        statusCode: 200,
        body: {
          message: "List of transactions",
          data: data,
        },
      };
    }

    throw createError("database don't existed");
  } catch (error: unknown) {
    console.log("error", error);
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
