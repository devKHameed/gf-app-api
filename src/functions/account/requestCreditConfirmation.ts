import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import { HttpStatusCode } from "axios";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import Stripe from "stripe";
import { Account, AccountUser, PackageCreditSetting } from "types";
import { AccountCredit, TransactionHistory } from "types/Transaction";
import {
  ACCOUNT_CREDIT,
  PACKAGES_CREDIT_SETTING,
  STRIPE_SECRET_KEY,
  TRANSACTION_HISTORY,
  envTableNames,
} from "../../config";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const stripe = new Stripe(STRIPE_SECRET_KEY!, {
  apiVersion: "2022-08-01",
});

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        payment_intent_id: {
          type: "string",
        },
        credit_type_id: {
          type: "string",
        },
        requested_credit: {
          type: "number",
        },
        package_id: {
          type: "string",
        },
      },
      required: [
        "payment_intent_id",
        "credit_type_id",
        "requested_credit",
        "package_id",
      ], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const dynamoDb = new DynamoDB.DocumentClient();

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { payment_intent_id, requested_credit, credit_type_id, package_id } =
    event.body;
  const user = event.user as AccountUser;
  const account = event.account as Account;
  if (!account.slug) throw createError("account id don't exist");
  if (!user.slug) throw createError("User don't exist");
  const databaseName = account.database_name;
  if (!databaseName) throw createError("database dont' exist");

  const params: DynamoDB.DocumentClient.GetItemInput = {
    TableName: envTableNames.DYNAMODB_PACKAGES_CREDIT_SETTING,
    Key: {
      id: PACKAGES_CREDIT_SETTING,
      slug: credit_type_id,
    },
  };

  try {
    const { Item } = await dynamoDb.get(params).promise();
    const credit = Item as PackageCreditSetting;
    if (!credit)
      throw createError(HttpStatusCode.BadRequest, "Invaide credit_type_id");

    const capture_payment_intent = await stripe.paymentIntents.capture(
      payment_intent_id
    );

    const connectionKnex = await connectKnex(databaseName);

    await connectionKnex<TransactionHistory>(TRANSACTION_HISTORY).insert({
      title: "credit Added",
      credit_type_id: credit_type_id,
      package_id: package_id,
      credited: requested_credit,
      user_id: user.slug,
      stripe_transaction_id: capture_payment_intent.id,
      stripe_amount: capture_payment_intent.amount,
    });

    const accountCredit = await connectionKnex<AccountCredit>(ACCOUNT_CREDIT)
      .increment("credits_available", requested_credit)
      .where("credit_type_id", credit.credit_id)
      .then(async (rows) => {
        console.log("rows", rows);
        if (rows === 0) {
          // if not exist create
          console.log("creating new record in", ACCOUNT_CREDIT);
          return await connectionKnex<AccountCredit>(ACCOUNT_CREDIT).insert({
            credit_type_id: credit.credit_id,
            credits_available: requested_credit,
          });
        }
        return rows;
      });

    return {
      statusCode: 200,
      body: { data: { credits: accountCredit } },
    };
  } catch (error: unknown) {
    console.log("error", error);
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
  .handler(lambdaHandler);
