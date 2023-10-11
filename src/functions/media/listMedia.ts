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
  const mediaType = event.queryStringParameters!.media_type;
  const parentId = event.queryStringParameters!.parent_id || null;
  const q = event.queryStringParameters!.q || null;

  const account = (event as any).account as Account;
  const databaseName = account.database_name;

  const keywords = q?.split(",") || [];

  try {
    if (databaseName) {
      const connectionKnex = await connectKnex(account.database_name);

      const query = connectionKnex("media")
        .select("*")
        .whereNot("is_deleted", 1);

      if (parentId !== "all") {
        void query.where("parent_id", parentId);
      }

      if (mediaType) {
        void query.where("media_type", mediaType);
      }

      if (keywords.length > 0) {
        void query.whereWrapped((builder) => {
          for (const [idx, keyword] of keywords.entries()) {
            if (idx === 0) {
              void builder.whereILike("title", `%${keyword}%`);
            } else {
              void builder.orWhereILike("title", `%${keyword}%`);
            }
          }
        });
      }

      void query.orderByRaw(
        `CASE 
            WHEN media_type = 'folder' THEN 1
            ELSE 2
        END, id`
      );

      const sql = query.toSQL().toNative();
      console.log({ query: sql });

      const result = await query;

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
