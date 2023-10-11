import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account } from "types";
import { UserMenuTemplate } from "types/UserMenu";
import { USER_MENU_TEMPLATE } from "../../config";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const account = (event as any).account as Account;
  const databaseName = account.database_name;
  // const user = (event as any).user as AccountUser;
  const user_slug = event.queryStringParameters?.user_slug;
  const userCustomTemplateSlug = `user_${user_slug}`;

  try {
    const connectionKnex = await connectKnex(databaseName);

    const menusTemplates = await connectionKnex<UserMenuTemplate>(
      USER_MENU_TEMPLATE
    ).where(function () {
      void this.where("template_slug", "not like", "user_%").orWhere(
        "template_slug",
        userCustomTemplateSlug
      );
    });

    return {
      statusCode: 200,
      body: { message: "List of menus templateds", data: menusTemplates },
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
  .use(getUser())
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
