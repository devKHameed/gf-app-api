import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import moment from "moment";
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
  required: ["body"],
} as const;

export const RequsetCreateDatasetBody = {
  title: "RequsetCreateDatasetBody",
  RequsetCreateDatasetBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const account = event.account as Account;

  try {
    if (account.database_name) {
      const knex = await connectKnex(account.database_name);
      const mediaTable = knex<Media>("media");

      let path = "";

      if (event.body.parent_id) {
        const [parentRecord] = await mediaTable.where(
          "id",
          event.body.parent_id as string
        );

        if (parentRecord) {
          path = parentRecord.path
            ? `${parentRecord.path}.${parentRecord.id}`
            : `${parentRecord.id}`;
        }
      }

      const [result] = await mediaTable.insert(
        [{ ...event.body, path }],
        ["id"]
      );
      return {
        statusCode: 201,
        body: {
          message: "Data Inserted",
          data: {
            ...event.body,
            id: result,
            path,
            is_deleted: 0,
            created_at: moment.utc().format(),
            updated_at: moment.utc().format(),
          },
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
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
  .use(jsonschemaErrors())
  .use(httpErrorHandler())
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
