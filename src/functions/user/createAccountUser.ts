import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import CognitoIdentityServiceProvider from "aws-sdk/clients/cognitoidentityserviceprovider";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { AccountUser } from "types";
import * as uuid from "uuid";
import {
  ACCOUNT_USER_SUBSCRIPTION,
  envTableNames,
  PUBLIC_COGNITO_USER_POOL,
  SYSTEM_USERS,
} from "../../config";
import customErrorStatus from "../../config/customErrorStatus";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import createValidationError from "../../util/createValidationError";
const dynamoDb = new DynamoDB.DocumentClient();

const cognitoIdp = new CognitoIdentityServiceProvider();
const USERPOOLID = PUBLIC_COGNITO_USER_POOL;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        email: {
          type: "string",
        },
        first_name: {
          type: "string",
        },
        last_name: {
          type: "string",
        },
        phone: {
          type: "string",
        },
        seat_type_id: {
          type: "string",
        },
        contact_data: {
          type: "object",
          default: {},
        },
        password: {
          type: "string",
          pattern:
            "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$",
        },
        mailing_address: {
          type: "object",
          default: {},
        },
      },
      required: [
        "email",
        "first_name",
        "last_name",
        "seat_type_id",
        "password",
      ],
    },
  },
  required: ["body"],
} as const;

const createAccountSubscription = async ({
  user_id,
  account_id,
  seat_type_id,
}: {
  user_id: string;
  account_id: string;
  seat_type_id: string;
}) => {
  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: envTableNames.DYNAMODB_ACCOUNT_USER_SUBSCRIPTION,
    Item: {
      id: `${account_id}:${ACCOUNT_USER_SUBSCRIPTION}`,
      account_id,
      user_id,
      seat_type_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
      createValidationError(
        { key: "email", message: "dublicate email" },
        customErrorStatus.DUBLICATE_EMAIL
      );
    }
  } catch (error: unknown) {
    console.log("error===>", error);
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

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
        UserPoolId: USERPOOLID!,
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
        UserPoolId: USERPOOLID!,
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

export const RequsetCreateAccountUserBody = {
  title: "RequsetCreateAccountUserBody",
  RequsetCreateAccountUserBody: eventSchema.properties.body,
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
    seat_type_id,
    mailing_address,
  } = event.body;

  const account_id: string = event.headers["account-id"] as string;

  const user_id = `false:${uuid.v4()}`;

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: envTableNames.DYNAMODB_SYS_USERS_TABLE,
    Item: {
      id: SYSTEM_USERS,
      slug: user_id,
      email,
      phone,
      last_name,
      first_name,
      mailing_address,
      created_at: new Date().toISOString(),
      updated_at: null,
      is_deleted: 0,
    },
  };

  try {
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
          ":email": email,
        },
      })
      .promise();

    let accountUser = Items?.[0] as AccountUser;

    const userAlreadyExisted = !!accountUser?.slug;
    console.log("------>userAlreadyExisted", userAlreadyExisted);

    //Create User If not Exists
    if (!userAlreadyExisted) {
      await dynamoDb.put(params).promise();
      accountUser = params.Item as AccountUser;

      console.log("------>newUser Created", accountUser);
    }

    //Create Subscription for user if there is none
    const subcriptions = await createAccountSubscription({
      user_id: accountUser.slug,
      account_id,
      seat_type_id,
    });

    //Create Congito User If it's a new user
    if (!userAlreadyExisted) await createCongitoUser({ email, password });
    return {
      statusCode: 201,
      body: { data: { user: accountUser, subcriptions } },
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
