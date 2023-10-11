import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import { AWSError } from "aws-sdk";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { ThreePAppV2 } from "types";
import { envTableNames } from "../../config";
import getAccountData from "../../middleware/getAccountData";
import has3pAppAccess from "../../middleware/has3pAppAccess";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const dynamoDb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        id: {
          type: "string",
          default: "",
        },
        slug: {
          type: "string",
          default: "",
        },
      },
      required: [], // Insert here all required event properties
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const TABLE_NAME = `${envTableNames.DYNAMODB_ACCT_3P_APPS}`;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const { id, slug } = event.body;

    const params: DynamoDB.DocumentClient.GetItemInput = {
      TableName: TABLE_NAME,
      Key: {
        id: id,
        slug: slug,
      },
    };

    const { Item: three_p_app } = await dynamoDb.get(params).promise();

    if (!three_p_app) {
      throw {
        message: [{ key: "app", value: "3P App doesn't exists" }],
        code: 404,
      };
    }

    const old_three_p_app = three_p_app as ThreePAppV2;
    three_p_app.three_p_version = old_three_p_app.three_p_version + 0.1;

    old_three_p_app.slug = old_three_p_app.slug.replace(
      "current:",
      "previous:"
    );

    const tableParams = {
      TableName: TABLE_NAME,
      Item: old_three_p_app,
    };

    await dynamoDb.put(tableParams).promise();

    let threePVersion;

    if (
      old_three_p_app.three_p_version -
        Math.floor(old_three_p_app.three_p_version) ===
      0
    ) {
      threePVersion = old_three_p_app.three_p_version + 1;
    } else {
      threePVersion = Math.round(old_three_p_app.three_p_version + 0.5);
    }

    const updateParams: DynamoDB.DocumentClient.UpdateItemInput =
      buildUpdateExpression({
        keys: {
          id: `${id}`,
          slug: `${slug}`,
        },
        tableName: TABLE_NAME,
        item: { three_p_version: threePVersion },
      });

    await dynamoDb.update(updateParams).promise();

    return {
      statusCode: 200,
      body: { message: "Version added", data: three_p_app },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(getAccountData())
  .use(has3pAppAccess())
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
  .use(
    httpResponseSerializer({
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
