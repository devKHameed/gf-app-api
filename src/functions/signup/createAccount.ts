import middy from "@middy/core";
// import some middlewares
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError, { HttpError } from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";

import httpErrorHandler from "@middy/http-error-handler";
import { HttpStatusCode } from "axios";
import { Knex } from "knex";
import {
  AccountUser,
  AccountUserType,
  Package,
  PackageCreditSetting,
} from "types";
import { AccountCredit, TransactionHistory } from "types/Transaction";
import { v4 } from "uuid";
import {
  ACCOUNTS_TABLE_NAME,
  ACCOUNT_CREDIT,
  ACCOUNT_USER_SUBSCRIPTION,
  ACCOUNT_USER_TYPES_TABLE_NAME,
  PACKAGES,
  PACKAGES_CREDIT_SETTING,
  SYSTEM_USERS,
  TRANSACTION_HISTORY,
  envTableNames,
} from "../../config";
import { signUpUserWithEmail } from "../../helpers/congito/signup";
import connectKnex from "../../helpers/knex/connect";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import validSqlDatabaseName from "../../util/dataset/validSqlDatabaseName";
import { createSchemaAndSwitch, up } from "../aurora/migration-v1";

const dynamoDb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        email: {
          type: "string",
          pattern: "^\\w+[\\.-]?\\w+@(\\w+\\.)+\\w{2,4}$",
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
        },
        company_name: {
          type: "string",
        },
        account_package_id: {
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
        pass_phrase: {
          type: "string",
        },
      },
      required: [
        "email",
        "first_name",
        "password",
        "company_name",
        "account_package_id",
      ],
    },
  },
  required: ["body"],
} as const;

export const RequsetCreateAccountBody = {
  title: "RequsetCreateAccountBody",
  RequsetCreateAccountBody: eventSchema.properties.body,
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
  database_name: string;
  account_id: string;
  account_package_id: string;
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
    account_package_id,
    phone,
    website_url,
    mailing_address_1,
    mailing_address_2,
    database_name,
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
      account_package_id,
      website_url: website_url,
      phone: phone,
      mailing_address_1: mailing_address_1,
      mailing_address_2: mailing_address_2,
      database_name,
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

export const createAccountUserType = async (
  event: Partial<AccountUserType>,
  options: { account_id: string }
) => {
  const { slug, name } = event;
  const account_id: string = options.account_id;

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: envTableNames.DYNAMODB_ACCT_USER_TYPES,
    Item: {
      id: `${account_id}:${ACCOUNT_USER_TYPES_TABLE_NAME}`,
      slug,
      name,
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

const getPackage = async (packageId: string) => {
  const params: DynamoDB.DocumentClient.GetItemInput = {
    TableName: envTableNames.DYNAMODB_PACKAGES,
    Key: {
      id: PACKAGES,
      slug: packageId,
    },
  };

  try {
    const { Item } = await dynamoDb.get(params).promise();
    return Item as Package;
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    console.log("error getPackage", error);
    throw createError(err.statusCode!, err, { expose: true });
  }
};
const setUpCredit = async (packageId: string, knex: Knex) => {
  const crditTypesParams: DynamoDB.DocumentClient.QueryInput = {
    TableName: envTableNames.DYNAMODB_PACKAGES_CREDIT_SETTING,
    KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
    FilterExpression: "#is_deleted = :is_deleted ",
    ExpressionAttributeNames: {
      "#id": "id",
      "#is_deleted": "is_deleted",
      "#slug": "slug",
    },
    ExpressionAttributeValues: {
      ":id": PACKAGES_CREDIT_SETTING,
      ":is_deleted": 0,
      ":slug": packageId,
    },
  };
  try {
    // fetch data from the database
    const { Items } = await dynamoDb.query(crditTypesParams).promise();
    const creditTypes = Items as PackageCreditSetting[];

    if (creditTypes.length) {
      await knex.batchInsert<TransactionHistory>(
        TRANSACTION_HISTORY,
        creditTypes.map((ct) => {
          return {
            package_id: packageId,
            credit_type_id: ct.slug,
            credited: ct.startup_qty,
            title: "start up credit",
            description: "credit assign at the start up",
          };
        })
      );
      await knex.batchInsert<AccountCredit>(
        ACCOUNT_CREDIT,
        creditTypes.map((ct) => {
          return {
            credit_type_id: ct.credit_id,
            credits_available: ct.startup_qty,
            credits_in_progress: 0,
          };
        })
      );
    }
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  console.log("event", event);
  const {
    email,
    password,
    phone,
    first_name,
    last_name,
    company_name,
    account_package_id,
    website_url,
    mailing_address_1,
    mailing_address_2,
    city,
    state,
    zip,
    pass_phrase,
  } = event.body;

  const account_id = `${company_name.replace(/ /g, "-")}${Math.floor(
    1 + Math.random() * 9
  )}`;
  const databaseName = validSqlDatabaseName(account_id);
  try {
    console.log("databaseName", databaseName);
    const pkg = await getPackage(account_package_id);
    if (!pkg.slug) throw createError("Invalid params. (account_package_id)");
    if (pkg.enable_pass && pass_phrase !== pkg.pass_phrase)
      throw createError("Invalid params. (pass phrase)");
    console.log("package found");

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

    const UserInfo = Items?.[0] as AccountUser;
    if (UserInfo?.slug)
      throw createError(HttpStatusCode.BadRequest, "Email already exists!");

    //Creating RDS Resources
    const knx = await connectKnex();
    const knex = await createSchemaAndSwitch(knx, databaseName);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await up(knex);

    const account = await createAccount({
      account_id,
      company_name,
      account_package_id,
      phone: phone!,
      website_url: website_url!,
      mailing_address_1: mailing_address_1!,
      mailing_address_2: mailing_address_2!,
      database_name: databaseName,
      city: city!,
      state: state!,
      zip: zip!,
    });

    const account_user_type = await createAccountUserType(
      {
        slug: "account-owner-type",
        name: "Account Owner",
      },
      { account_id }
    );

    const userSlug = `false:${v4()}`;
    const Userparams: DynamoDB.DocumentClient.PutItemInput = {
      TableName: envTableNames.DYNAMODB_SYS_USERS_TABLE,
      Item: {
        id: SYSTEM_USERS,
        slug: userSlug,
        email,
        phone,
        last_name,
        first_name,
        created_at: new Date().toISOString(),
        updated_at: null,
        is_deleted: 0,
      },
    };

    await dynamoDb.put(Userparams).promise();
    const userData = Userparams.Item as AccountUser;

    const subcriptions = await createAccountSubscription({
      user_id: userData.slug,
      account_id,
    });

    //add setup credit
    await setUpCredit(account_package_id, knex);
    await signUpUserWithEmail({
      email: userData.email,
      username: userData.email,
      password: password,
    });

    return {
      statusCode: 201,
      body: {
        // data: { account },
      },
    };
  } catch (error) {
    const err = error as HttpError;
    throw createError(
      err.statusCode || HttpStatusCode.InternalServerError,
      err,
      { expose: true }
    );
  }
};

export const handler = middy()
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
  )
  .handler(lambdaHandler); // handles common http errors and returns proper responses
