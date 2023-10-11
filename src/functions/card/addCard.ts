import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import stripe, { type Stripe } from "stripe";
import { Account, AccountUser } from "types";
import {
  ACCOUNTS_TABLE_NAME,
  STRIPE_SECRET_KEY,
  SYSTEM_USERS,
  envTableNames,
} from "../../config";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const stripeIntance = new stripe(STRIPE_SECRET_KEY!, {
  apiVersion: "2022-08-01",
  typescript: true,
});

const dynamoDb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        card_token: {
          type: "string",
        },
      },
      required: ["card_token"], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

export const RequsetAddCardBody = {
  title: "RequsetAddCardBody",
  RequsetAddCardBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { card_token } = event.body;

  const accountId: string = event.headers["account-id"] as string;
  const account = event.account as Account;
  const user = event.user as AccountUser;
  const databaseName = account.database_name;
  if (!user.slug) throw createError("user does not exists!");

  try {
    let stripeCustomer: Stripe.Customer | undefined = user.stripe_customer;

    if (!stripeCustomer) {
      stripeCustomer = await stripeIntance.customers.create({
        name: `${user.first_name || ""} ${user.last_name || ""}`,
        email: user.email,
        description: "Stripe Guifusion Customer",
      });
      // update user stripe info
      console.log("creating user stripe account", user.slug);
      await dynamoDb
        .update(
          buildUpdateExpression({
            tableName: envTableNames.DYNAMODB_SYS_USERS_TABLE,
            keys: { id: SYSTEM_USERS, slug: user.slug },
            item: {
              stripe_customer: stripeCustomer,
              updated_at: new Date().toISOString(),
            },
          })
        )
        .promise();
    }
    //Create new Stripe source
    const stripeNewCard = await stripeIntance.customers.createSource(
      stripeCustomer.id,
      {
        source: card_token,
      }
    );

    const accountCards = account?.stripe_card || [];

    const accountCard = {
      ...stripeNewCard,
      primary: account.stripe_card?.length ? false : true,
    };

    const newStripeCards = [...accountCards, accountCard];

    console.log("updating account with new stripe card");
    const updateAccount = await dynamoDb
      .update(
        buildUpdateExpression({
          tableName: envTableNames.DYNAMODB_GLOBAL_ACCOUNT_SETTINGS,
          keys: { id: ACCOUNTS_TABLE_NAME, slug: accountId },
          item: {
            stripe_card: newStripeCards,
            has_card: true,
            updated_at: new Date().toISOString(),
          },
        })
      )
      .promise();

    return {
      statusCode: 201,
      body: { data: accountCard },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
  .use(jsonschemaErrors())
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
