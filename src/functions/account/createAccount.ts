import middy from "@middy/core";
import * as uuid from "uuid";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { AccountUserType, ContactType } from "types";
import {
  ACCOUNTS_TABLE_NAME,
  ACCOUNT_CONTACT_TYPES_TABLE_NAME,
  ACCOUNT_USER_TYPES_TABLE_NAME,
  envTableNames,
} from "../../config";
import duplicateSlugCheck from "../../middleware/duplicateSlugCheck";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_CONTACT_TYPES;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          pattern: "^[a-zA-Z0-9-]*$",
        },
        name: {
          type: "string",
        },
        type: {
          type: "string",
        },
        startup_fee: {
          type: "number",
          default: 250,
        },
        monthly_fee: {
          type: "number",
          default: 99,
        },
        app_user_settings: {
          type: "object",
          default: {},
        },
        user_limit_settings: {
          type: "object",
          default: {},
        },
        operation_settings: {
          type: "object",
          default: {},
        },
        settings: {
          type: "object",
          default: {},
        },
        project_settings: {
          type: "object",
          default: {},
        },
        dynamo_storage_settings: {
          type: "object",
          default: {},
        },
        sql_storage_settings: {
          type: "object",
          default: {},
        },
        chat_settings: {
          type: "object",
          default: {},
        },
      },
      required: ["slug"], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

export const RequsetCreateAccountBody = {
  title: "RequsetCreateAccountBody",
  RequsetCreateAccountBody: eventSchema.properties.body,
};

export const createContactType = async (
  event: Partial<ContactType>,
  options: { account_id: string }
) => {
  const { slug, name, fields } = event;
  const account_id: string = options.account_id;

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: envTableNames.DYNAMODB_ACCT_CONTACT_TYPES,
    Item: {
      id: `${account_id}:${ACCOUNT_CONTACT_TYPES_TABLE_NAME}`,
      slug,
      name,
      fields,
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
export const createAccountUserType = async (
  event: Partial<AccountUserType>,
  options: { account_id: string }
) => {
  const { slug, name, fields, permissions } = event;
  const account_id: string = options.account_id;

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: envTableNames.DYNAMODB_ACCT_USER_TYPES,
    Item: {
      id: `${account_id}:${ACCOUNT_USER_TYPES_TABLE_NAME}`,
      slug,
      name,
      fields,
      permissions,
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

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const {
    account_slug,
    name,
    startup_fee,
    monthly_fee,
    app_user_settings,
    user_limit_settings,
    operation_settings,
    contact_settings,
    project_settings,
    dynamo_storage_settings,
    sql_storage_settings,
    chat_settings,
    type,
  } = event.body;

  const account_id = uuid.v4();

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: envTableNames.DYNAMODB_GLOBAL_ACCOUNT_SETTINGS,
    Item: {
      id: ACCOUNTS_TABLE_NAME,
      slug: account_id,
      account_slug,
      type,
      name,
      startup_fee,
      monthly_fee,
      app_user_settings,
      user_limit_settings,
      operation_settings,
      contact_settings,
      project_settings,
      dynamo_storage_settings,
      sql_storage_settings,
      chat_settings,
      created_at: new Date().toISOString(),
      updated_at: null,
      is_active: 1,
      is_deleted: 0,
    },
  };

  try {
    await dynamoDb.put(params).promise();
    const contactType = await createContactType(
      {
        slug: "team-member-contact-type",
        name: "Team Member",
      },
      { account_id }
    );
    const accountUserType = await createAccountUserType(
      {
        slug: "account-owner-type",
        name: "Account Owner",
      },
      { account_id }
    );

    return {
      statusCode: 201,
      body: { data: { account: params.Item, contactType, accountUserType } },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
  .use(
    duplicateSlugCheck({
      tableName: TABLE_NAME,
      accountPostfix: `${ACCOUNT_CONTACT_TYPES_TABLE_NAME}`,
    })
  )
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
  )
  .handler(lambdaHandler); // handles common http errors and returns proper responses
