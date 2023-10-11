import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import jwt from "jsonwebtoken";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import Stripe from "stripe";
import { AccountType, AccountUser } from "../../types";
import buildUpdateExpression from "../../util/buildUpdateExpression";

import * as uuid from "uuid";
import {
  ACCOUNT_TYPES_TABLE_NAME,
  envTableNames,
  STRIPE_SECRET_KEY,
  SYSTEM_USERS,
} from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
const dynamoDb = new DynamoDB.DocumentClient();
const stripe = new Stripe(STRIPE_SECRET_KEY!, {
  apiVersion: "2022-08-01",
});

const STARTUP_FEE = 250;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        email: {
          type: "string",
          default: "",
        },
        first_name: {
          type: "string",
        },
        last_name: {
          type: "string",
        },
        phone: {
          type: "string",
          default: "",
        },
        password: {
          type: "string",
          pattern:
            "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$",
          default: "Test123*",
        },
        company_name: {
          type: "string",
        },
        account_type_slug: {
          type: "string",
        },
        card_token: {
          type: "string",
        },
        name_on_card: {
          type: "string",
        },
        website_url: {
          type: "string",
          default: "",
        },
        mailing_address_1: {
          type: "string",
          default: "",
        },
        mailing_address_2: {
          type: "string",
          default: "",
        },
        city: {
          type: "string",
          default: "",
        },
        state: {
          type: "string",
          default: "",
        },
        zip: {
          type: "string",
          default: "",
        },
      },
      required: [
        "email",
        "first_name",
        "phone",
        "password",
        "company_name",
        "account_type_slug",
        "card_token",
        "name_on_card",
        "website_url",
        "mailing_address_1",
        "mailing_address_2",
        "city",
        "state",
        "zip",
      ],
    },
  },
  required: ["body"],
} as const;

export const RequsetCreateAccountBody = {
  title: "RequsetCreateAccountBody",
  RequsetCreateAccountBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const {
    email,
    password,
    phone,
    first_name,
    last_name,
    company_name,
    account_type_slug,
    card_token,
    name_on_card,
    website_url,
    mailing_address_1,
    mailing_address_2,
    city,
    state,
    zip,
  } = event.body;

  let tUser: any = {};

  let emailAddress = email;
  let authorizationExist = false;
  if (event.headers.authorization) {
    const token = event.headers.authorization!.replace("Bearer ", "");
    tUser = jwt.decode(token) as { email: string };
    emailAddress = tUser.email;
    authorizationExist = true;
  }

  try {
    const account_id = `${company_name.replace(/ /g, "-")}${Math.floor(
      1 + Math.random() * 9
    )}`;

    const accountTypeParams: DynamoDB.DocumentClient.GetItemInput = {
      TableName: envTableNames.DYNAMODB_GLOBAL_ACCOUNT_SETTINGS,
      Key: {
        id: ACCOUNT_TYPES_TABLE_NAME,
        slug: account_type_slug,
      },
    };

    const { Item: accountTypeItem } = await dynamoDb
      .get(accountTypeParams)
      .promise();

    const accountType = accountTypeItem as AccountType;

    const accountExisted = !!accountType?.slug;

    if (!accountExisted) {
      throw createError("Invalid account type!");
    }

    const max_template_uses: number = accountType.max_template_uses ?? 0;
    const templates_sold: number = accountType.templates_sold ?? 0;

    if (max_template_uses !== 0 && templates_sold >= max_template_uses) {
      throw createError(400, "Invalid account type!", { expose: true });
    }

    const { Items } = await dynamoDb
      .query({
        TableName: envTableNames.DYNAMODB_SYS_USERS_TABLE,
        IndexName: "email_lsi_index",
        KeyConditionExpression: "#id = :id AND #email = :email",
        ExpressionAttributeNames: {
          "#id": "id",
          "#email": "email",
        },
        ExpressionAttributeValues: {
          ":id": SYSTEM_USERS,
          ":email": emailAddress,
        },
      })
      .promise();

    let user_data = Items?.[0] as AccountUser;

    const userAlreadyExisted = !!user_data?.slug;

    if (
      userAlreadyExisted &&
      !authorizationExist &&
      user_data?.slug.includes("true:")
    )
      throw createError("Email already exists!");

    let stripe_customer: any = {};

    if (userAlreadyExisted && user_data.stripe_customer) {
      stripe_customer = user_data.stripe_customer;
    } else {
      stripe_customer = await stripe.customers.create({
        name: name_on_card,
        email: emailAddress,
        description: "Stripe Guifusion Customer",
      });
    }

    const stripe_card = await stripe.customers.createSource(
      `${stripe_customer.id}`,
      {
        source: card_token,
      }
    );

    const payment_intent = await stripe.paymentIntents.create({
      customer: stripe_customer.id,
      amount: Math.round(STARTUP_FEE * 100),
      currency: "usd",
      payment_method_types: ["card"],
      capture_method: "manual",
      payment_method: stripe_card.id,
      metadata: {
        //any metadata u want
      },
    });

    const account_data: object = {
      company_name,
      account_id,
      account_type_slug,
      stripe_customer,
      stripe_card,
      payment_intent,
      phone,
      website_url,
      mailing_address_1,
      mailing_address_2,
      city,
      state,
      zip,
    };

    if (!authorizationExist) {
      const user_id = `false:${uuid.v4()}`;
      const params: DynamoDB.DocumentClient.PutItemInput = {
        TableName: envTableNames.DYNAMODB_SYS_USERS_TABLE,
        Item: {
          id: SYSTEM_USERS,
          slug: user_id,
          email: emailAddress,
          password,
          phone,
          last_name,
          first_name,
          stripe_customer,
          account_data,
          created_at: new Date().toISOString(),
          updated_at: null,
          is_deleted: 0,
        },
      };

      //Create User If not Exists
      if (!userAlreadyExisted) {
        await dynamoDb.put(params).promise();
        user_data = params.Item as AccountUser;
        console.log("------>newUser Created", user_data);
      } else {
        const params: DynamoDB.DocumentClient.UpdateItemInput =
          buildUpdateExpression({
            keys: {
              id: SYSTEM_USERS,
              slug: user_data.slug,
            },
            tableName: envTableNames.DYNAMODB_SYS_USERS_TABLE,
            item: { stripe_customer, account_data },
          });

        await dynamoDb.update(params).promise();
      }
    } else {
      if (!userAlreadyExisted) {
        throw createError("User does not exists!");
      } else {
        const params: DynamoDB.DocumentClient.UpdateItemInput =
          buildUpdateExpression({
            keys: {
              id: SYSTEM_USERS,
              slug: user_data.slug,
            },
            tableName: envTableNames.DYNAMODB_SYS_USERS_TABLE,
            item: { stripe_customer, account_data },
          });

        await dynamoDb.update(params).promise();
      }
    }

    return {
      statusCode: 201,
      body: {
        data: {
          user_data,
          payment_intent,
        },
      },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy(lambdaHandler, { timeoutEarlyInMillis: 0 })
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
  .use(jsonschemaErrors())
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
  ); // handles common http errors and returns proper responses
