import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import jwt from "jsonwebtoken";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account, AccountSubscription, AccountUser } from "types";
import { ACCOUNTS_TABLE_NAME, SYSTEM_USERS, envTableNames } from "../../config";
const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_SYS_USERS_TABLE;
const ACCOUNT_ASSOCIATION_TABLE_NAME =
  envTableNames.DYNAMODB_ACCOUNT_USER_SUBSCRIPTION;
const GLOBAL_ACCOUNT_SETTINGS_TABLE_NAME =
  envTableNames.DYNAMODB_GLOBAL_ACCOUNT_SETTINGS;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  try {
    const {
      headers: { authorization },
    } = event;
    const token = authorization!.replace("Bearer ", "");
    const tUser = jwt.decode(token) as { email: string };

    const { Items } = await dynamoDb
      .query({
        TableName: TABLE_NAME,
        IndexName: "email_lsi_index",
        KeyConditionExpression: "#id = :id AND #email = :email",
        ExpressionAttributeNames: {
          "#id": "id",
          "#email": "email",
        },
        ExpressionAttributeValues: {
          ":id": SYSTEM_USERS,
          ":email": tUser.email,
        },
        ProjectionExpression:
          "id, slug, email, phone, first_name, last_name, created_at, updated_at, is_deleted",
      })
      .promise();
    const User = Items?.[0] as AccountUser;

    if (!User?.slug) throw createError("user does not exists!");

    const extraData: { [key: string]: any } = {};
    console.log(User.slug);
    const association = await dynamoDb
      .query({
        TableName: ACCOUNT_ASSOCIATION_TABLE_NAME,
        IndexName: "user_id_gsi_index",
        KeyConditionExpression: "#user_id = :user_id",
        ExpressionAttributeNames: {
          "#user_id": "user_id",
        },
        ExpressionAttributeValues: {
          ":user_id": User.slug,
        },
      })
      .promise();

    // extraData.association = association;
    if (association.Items?.length) {
      const Keys = (association.Items as AccountSubscription[])?.map((as) => ({
        id: ACCOUNTS_TABLE_NAME,
        slug: as.account_id,
      }));
      const { Responses } = await dynamoDb
        .batchGet({
          RequestItems: {
            [GLOBAL_ACCOUNT_SETTINGS_TABLE_NAME]: {
              Keys,
            },
          },
        })
        .promise();

      const user_accounts: Array<Account> = [];
      const accounts = (Responses as any)[
        GLOBAL_ACCOUNT_SETTINGS_TABLE_NAME
      ] as (Account & { subscription: AccountSubscription })[];

      if (accounts?.length) {
        accounts.map((itm) => {
          const subscription = (
            association.Items as AccountSubscription[]
          ).find((as) => as.account_id === itm.slug);
          delete itm.stripe_card;
          //adding backsubscription
          itm.subscription = subscription!;
          if (itm.is_active === 1) user_accounts.push(itm);
        });
      }

      // extraData.Keys = Keys;
      extraData.accounts = user_accounts;
    }

    // }
    return {
      statusCode: 201,
      body: { user: User, ...extraData },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy(lambdaHandler, { timeoutEarlyInMillis: 0 })
  // .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
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
  );
