import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account } from "types";
import { UserMenuItem } from "types/UserMenu";
import { USER_MENU_ITEM } from "../../config";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        sorted_menu_ids: {
          type: "array",
          default: [],
        },
      },
      required: ["sorted_menu_ids"],
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const account = (event as any).account as Account;
  const databaseName = account.database_name;
  const sortedMenuIds: number[] = event.body
    .sorted_menu_ids as unknown as number[];
  console.log(
    "🚀 ~ file: SortMenu.ts:40 ~ >= ~ sorted_menu_ids:",
    sortedMenuIds
  );

  try {
    const connectionKnex = await connectKnex(databaseName);

    await connectionKnex.transaction(async (trx) => {
      for (let i = 0; i < sortedMenuIds.length; i++) {
        const sortedMenuId = sortedMenuIds[i];
        const updatedSortOrder = i + 1; // Assuming sort_order starts from 1

        await trx(USER_MENU_ITEM)
          .where({ id: sortedMenuId })
          .update({ sort_order: updatedSortOrder });
      }
    });

    const menusTemplates = await connectionKnex<UserMenuItem>(USER_MENU_ITEM);

    return {
      statusCode: 200,
      body: { message: "updated", data: menusTemplates },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser())
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
  .use(validator({ eventSchema })) // validates the input
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
