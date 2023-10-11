// import some middlewares
import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import CognitoIdentityServiceProvider from "aws-sdk/clients/cognitoidentityserviceprovider";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import jwt from "jsonwebtoken";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import stripe from "stripe";
import {
  ACCOUNTS_TABLE_NAME,
  ACCOUNT_TYPES_TABLE_NAME,
  ACCOUNT_USER_SUBSCRIPTION,
  ACCOUNT_USER_TYPES_TABLE_NAME,
  PUBLIC_COGNITO_USER_POOL,
  STRIPE_SECRET_KEY,
  SYSTEM_USERS,
  envTableNames,
} from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { AccountUser, AccountUserType } from "../../types";

const dynamoDb = new DynamoDB.DocumentClient();

const cognitoIdp = new CognitoIdentityServiceProvider();
const USERPOOLID = PUBLIC_COGNITO_USER_POOL!;
const stripeIntance = new stripe(STRIPE_SECRET_KEY!, {
  apiVersion: "2022-08-01",
  typescript: true,
});

const STARTUP_FEE = 250;
const MONTHLY_FEE = 99;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        payment_intent_id: {
          type: "string",
        },
        email: {
          type: "string",
        },
      },
      required: ["payment_intent_id"],
    },
  },
  required: ["body"],
} as const;

const createCongitoUser = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  try {
    // Create in User Pool
    await cognitoIdp
      .adminCreateUser({
        UserPoolId: USERPOOLID,
        Username: email,
        TemporaryPassword: password,
        UserAttributes: [
          {
            Name: "email",
            Value: email,
          },
        ],
      })
      .promise();

    // Set permanent user password
    await cognitoIdp
      .adminSetUserPassword({
        UserPoolId: USERPOOLID,
        Username: email,
        Password: password,
        Permanent: true,
      })
      .promise();
  } catch (error: unknown) {
    console.log("error", error);
    throw error;
  }
};

const createAccountSubscription = async ({
  user_id,
  account_id,
}: {
  user_id: string;
  account_id: string;
}) => {
  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: envTableNames.DYNAMODB_ACCOUNT_USER_SUBSCRIPTION,
    Item: {
      id: `${account_id}:${ACCOUNT_USER_SUBSCRIPTION}`,
      user_id,
      account_id,
      account_user_type: "account-owner-type",
      account_contact_id: "team-member-contact-type",
      created_at: new Date().toISOString(),
      updated_at: null,
    },
  };

  try {
    const { Item } = await dynamoDb
      .get({
        TableName: envTableNames.DYNAMODB_ACCOUNT_USER_SUBSCRIPTION,
        Key: {
          id: `${account_id}:${ACCOUNT_USER_SUBSCRIPTION}`,
          user_id,
        },
      })
      .promise();
    const subcription = Item as any;
    if (!subcription) {
      await dynamoDb.put(params).promise();
      return {
        message: "created sucessfully",
        data: params.Item,
      };
    } else {
      return {
        message: "already exsist",
        data: Item,
      };
    }
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

const createAccount = async (props: {
  company_name: string;
  account_id: string;
  account_type_slug: string;
  stripe_customer: object;
  stripe_card: object;
  payment_intent: object;
  phone: string;
  website_url: string;
  mailing_address_1: string;
  mailing_address_2: string;
  city: string;
  state: string;
  zip: string;
}) => {
  const {
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
  } = props;

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: envTableNames.DYNAMODB_GLOBAL_ACCOUNT_SETTINGS,
    Item: {
      id: ACCOUNTS_TABLE_NAME,
      slug: account_id,
      name: company_name,
      account_type_slug: account_type_slug,
      startup_fee: STARTUP_FEE,
      monthly_fee: MONTHLY_FEE,
      app_user_settings: {},
      user_limit_settings: {},
      operation_settings: {},
      contact_settings: {},
      project_settings: {},
      dynamo_storage_settings: {},
      sql_storage_settings: {},
      stripe_customer: stripe_customer,
      stripe_card: stripe_card,
      payment_intent: payment_intent,
      chat_settings: {},
      website_url: website_url,
      phone: phone,
      mailing_address_1: mailing_address_1,
      mailing_address_2: mailing_address_2,
      city: city,
      state: state,
      zip: zip,
      created_at: new Date().toISOString(),
      updated_at: null,
      is_active: 1,
      is_deleted: 0,
    },
  };

  try {
    await dynamoDb.put(params).promise();
    return params.Item;
  } catch (error: unknown) {
    return {
      statusCode: 501,
      message: "Couldn't create",
    };
  }
};

// export const createContactType = async (
//   event: Partial<ContactType>,
//   options: { account_id: string }
// ) => {
//   const { slug, name } = event;
//   const account_id: string = options.account_id;

//   const params: DynamoDB.DocumentClient.PutItemInput = {
//     TableName: envTableNames.DYNAMODB_ACCT_CONTACT_TYPES,
//     Item: {
//       id: `${account_id}:${ACCOUNT_CONTACT_TYPES_TABLE_NAME}`,
//       slug,
//       name,
//       fields: {},
//       created_at: new Date().toISOString(),
//       updated_at: null,
//       is_active: 1,
//       is_deleted: 0,
//     },
//   };

//   try {
//     // write a contact to the database
//     await dynamoDb.put(params).promise();
//     return params.Item;
//   } catch (error: unknown) {
//     return {
//       statusCode: 501,
//       message: "Couldn't create",
//     };
//   }
// };

export const createAccountUserType = async (
  event: Partial<AccountUserType>,
  options: { account_id: string }
) => {
  const { slug, name, contact_type_id } = event;
  const account_id: string = options.account_id;

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: envTableNames.DYNAMODB_ACCT_USER_TYPES,
    Item: {
      id: `${account_id}:${ACCOUNT_USER_TYPES_TABLE_NAME}`,
      slug,
      name,
      contact_type_id,
      fields: {},
      permissions: {},
      created_at: new Date().toISOString(),
      updated_at: null,
      is_active: 1,
      is_deleted: 0,
    },
  };

  try {
    // write a contact to the database
    await dynamoDb.put(params).promise();
    return params.Item;
  } catch (error: unknown) {
    return {
      statusCode: 501,
      message: "Couldn't create",
    };
  }
};

export const RequsetVerifyPaymentBody = {
  title: "RequsetVerifyPaymentBody",
  RequsetVerifyPaymentBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { payment_intent_id, email } = event.body;

  let tUser: any = {};

  let emailAddress = email;
  let createCognitoUser = true;
  if (event.headers.authorization) {
    const token = event.headers.authorization!.replace("Bearer ", "");
    tUser = jwt.decode(token) as { email: string };
    emailAddress = tUser.email;
    createCognitoUser = false;
  }

  try {
    const capture_payment_intent = await stripeIntance.paymentIntents.capture(
      payment_intent_id
    );

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

    const user_data = Items?.[0] as AccountUser;
    const userAlreadyExisted = !!user_data?.slug;

    if (!userAlreadyExisted) throw createError("User does not exists!");

    const oldUserSlug = user_data.slug;

    const account = await createAccount({
      company_name: user_data.account_data.company_name,
      account_id: user_data.account_data.account_id,
      account_type_slug: user_data.account_data.account_type_slug,
      stripe_customer: user_data.account_data.stripe_customer,
      stripe_card: [{ ...user_data.account_data.stripe_card, primary: true }],
      payment_intent: user_data.account_data.payment_intent,
      phone: user_data.account_data.phone,
      website_url: user_data.account_data.website_url,
      mailing_address_1: user_data.account_data.mailing_address_1,
      mailing_address_2: user_data.account_data.mailing_address_2,
      city: user_data.account_data.city,
      state: user_data.account_data.state,
      zip: user_data.account_data.zip,
    });

    // const contact_type = await createContactType(
    //   {
    //     slug: "team-member-contact-type",
    //     name: "Team Member",
    //   },
    //   { account_id: user_data.account_data.account_id }
    // );

    const account_user_type = await createAccountUserType(
      {
        slug: "account-owner-type",
        contact_type_id: "team-member-contact-type",
        name: "Account Owner",
      },
      { account_id: user_data.account_data.account_id }
    );

    //Create Subscription for user if there is none
    const subcription = await createAccountSubscription({
      user_id: user_data.slug.replace("false", "true"),
      account_id: user_data.account_data.account_id,
    });

    const updateAccountTypeParams: DynamoDB.DocumentClient.UpdateItemInput = {
      TableName: envTableNames.DYNAMODB_GLOBAL_ACCOUNT_SETTINGS,
      Key: {
        id: ACCOUNT_TYPES_TABLE_NAME,
        slug: user_data.account_data.account_type_slug,
      },
      UpdateExpression: "SET templates_sold = templates_sold + :num",
      ExpressionAttributeValues: {
        ":num": 1,
      },
    };

    await dynamoDb.update(updateAccountTypeParams).promise();

    if (createCognitoUser) {
      await createCongitoUser({
        email: user_data.email,
        password: user_data.password!,
      });
    }

    user_data.slug = user_data.slug.replace("false", "true");
    user_data.password = null;
    user_data.account_data = {};

    await dynamoDb
      .delete({
        TableName: envTableNames.DYNAMODB_SYS_USERS_TABLE,
        Key: {
          id: SYSTEM_USERS,
          slug: oldUserSlug,
        },
      })
      .promise();

    const params: DynamoDB.DocumentClient.PutItemInput = {
      TableName: envTableNames.DYNAMODB_SYS_USERS_TABLE,
      Item: user_data,
    };

    await dynamoDb.put(params).promise();

    return {
      statusCode: 200,
      body: {
        data: {
          capture_payment_intent,
          account,
          // contact_type,
          account_user_type,
          subcription,
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
