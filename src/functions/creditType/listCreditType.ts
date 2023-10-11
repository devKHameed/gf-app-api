import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account, CreditTypes, PackageCreditSetting } from "types/Account";
import { AccountCredit } from "types/Transaction";
import {
  ACCOUNT_CREDIT,
  CREDIT_TYPES,
  PACKAGES_CREDIT_SETTING,
  envTableNames,
} from "../../config";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const packageSlug = event.queryStringParameters?.package_slug;
  const account = (event as any)?.account as Account;
  console.log("account", account);
  if (!account?.database_name)
    throw createError("account database doen't exist");

  const params: DynamoDB.DocumentClient.QueryInput = {
    TableName: envTableNames.DYNAMODB_PACKAGES_CREDIT_SETTING,
    KeyConditionExpression: "#id = :id",
    FilterExpression: "#is_deleted = :is_deleted",
    ExpressionAttributeNames: {
      "#id": "id",
      "#is_deleted": "is_deleted",
      "#slug": "slug",
    },
    ExpressionAttributeValues: {
      ":id": PACKAGES_CREDIT_SETTING,
      ":is_deleted": 0,
      ":slug": packageSlug,
    },
  };

  if (packageSlug)
    params.KeyConditionExpression = `${params.KeyConditionExpression} AND begins_with(#slug, :slug)`;

  try {
    // fetch data from the database
    const { Items } = await dynamoDb.query(params).promise();

    let creditTypes = (Items as PackageCreditSetting[]) || [];
    const connectionKnex = await connectKnex(account.database_name);
    const accountCredits = await connectionKnex<AccountCredit>(ACCOUNT_CREDIT);
    console.log("creadit", accountCredits);
    if (creditTypes?.length) {
      const creditTypesMetadata = await dynamoDb
        .batchGet({
          RequestItems: {
            [envTableNames.DYNAMODB_CREDIT_TYPES]: {
              Keys: creditTypes.map((item) => {
                return { id: CREDIT_TYPES, slug: item.credit_id };
              }),
            },
          },
        })
        .promise()
        .then((res) => {
          // console.log("res", res);
          return res?.Responses?.[
            envTableNames.DYNAMODB_CREDIT_TYPES
          ] as CreditTypes[];
        });
      creditTypes = creditTypes.map((item) => {
        const defaultValues = creditTypesMetadata?.find(
          (credit) => credit.slug === item.credit_id
        );
        const availableCredit = accountCredits?.find(
          (credit) => credit.credit_type_id === item.credit_id
        );
        return {
          ...defaultValues,
          ...item,
          credits_available: availableCredit?.credits_available,
        };
      });
    }
    return {
      statusCode: 200,
      body: { message: "List of package credits", data: creditTypes },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
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
  ) // handles common http errors and returns proper responses
  .handler(lambdaHandler);
