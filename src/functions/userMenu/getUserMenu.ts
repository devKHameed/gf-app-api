import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import { default as createError } from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account, AccountSubscription, AccountUser } from "types";
import { UserMenuTemplate } from "types/UserMenu";
import {
  ACCOUNT_USER_SUBSCRIPTION,
  USER_MENU_ITEM,
  USER_MENU_TEMPLATE,
  envTableNames,
} from "../../config";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
const dynamoDb = new DynamoDB.DocumentClient();

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const user = (event as any).user as AccountUser;
  const account = (event as any).account as Account;
  const databaseName = account.database_name;
  const account_id: string = event.headers["account-id"] as string;

  if (!user.slug) throw createError("invalid params");

  const userSubscription: DynamoDB.DocumentClient.GetItemInput = {
    TableName: envTableNames.DYNAMODB_ACCOUNT_USER_SUBSCRIPTION,
    Key: {
      id: `${account_id}:${ACCOUNT_USER_SUBSCRIPTION}`,
      user_id: user.slug,
    },
  };

  try {
    const accountSubscription = (await dynamoDb
      .get(userSubscription)
      .promise()
      .then((res) => res.Item)) as AccountSubscription;
    if (accountSubscription.template_id) {
      const connectionKnex = await connectKnex(databaseName);

      const res = await connectionKnex<UserMenuTemplate>(USER_MENU_TEMPLATE)
        .select(`${USER_MENU_TEMPLATE}.*`, `${USER_MENU_ITEM}.*`)
        .where(`${USER_MENU_TEMPLATE}.id`, accountSubscription.template_id)
        .leftJoin(
          USER_MENU_ITEM,
          `${USER_MENU_TEMPLATE}.id`,
          `${USER_MENU_ITEM}.parent_menu`
        );

      return {
        statusCode: 201,
        body: { message: "user account menu", data: res },
      };
    }

    return {
      statusCode: 201,
      body: { message: "user account menu", data: [] },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
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
