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
import Stripe from "stripe";
import { Account, AccountUser, PackageCreditSetting } from "types";
import {
  PACKAGES_CREDIT_SETTING,
  STRIPE_SECRET_KEY,
  envTableNames,
} from "../../config";
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
        credit_type_id: {
          type: "string",
        },
        requested_credit: {
          type: "number",
        },
      },
      required: ["credit_type_id", "requested_credit"], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const dynamoDb = new DynamoDB.DocumentClient();

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { credit_type_id, requested_credit } = event.body;
  const user = event.user as AccountUser;
  const account = event.account as Account;
  if (!account.slug) throw createError("account id don't exist");
  if (!user.slug) throw createError("User don't exist");
  if (!user.stripe_customer?.id)
    throw createError("user dosn't have stripe id");

  const primaryCard = account.stripe_card?.find((card) => card.primary);

  if (!primaryCard) throw createError("no card found");

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
    const incrementalCost = credit.additional_cost;
    const requestCreditCost =
      (requested_credit / credit.additional_increment) * incrementalCost;

    const payment_intent = await stripe.paymentIntents.create({
      customer: user.stripe_customer?.id,
      amount: Math.round(requestCreditCost * 100),
      currency: "usd",
      payment_method_types: ["card"],
      capture_method: "manual",
      payment_method: primaryCard.id,
    });
    return {
      statusCode: 200,
      body: { data: { payment_intent } },
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
  .handler(lambdaHandler);
