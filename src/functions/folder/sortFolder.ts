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
import { Folder } from "types";
import { envTableNames, FOLDERS, RESOURCES, STAGE } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_FOLDERS;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        data: {
          type: "array",
        },
        resource: {
          type: "string",
        },
      },
      required: ["data", "resource"],
    },
  },
  required: ["body"],
} as const;

export const RequsetCreateDatasetBody = {
  title: "RequsetCreateDatasetBody",
  RequsetCreateDatasetBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { data, resource } = event.body;
  const account_id: string = event.headers["account-id"] as string;

  try {
    if (!data?.length) {
      return {
        statusCode: 404,
        body: "No apps found",
      };
    }
    let folderCounter = 0;
    for (const dataItem of data as Folder[]) {
      const params: DynamoDB.DocumentClient.UpdateItemInput =
        buildUpdateExpression({
          keys: {
            id: `${account_id}:${FOLDERS}`,
            slug: `${dataItem.id}`,
          },
          tableName: TABLE_NAME,
          item: { sort_order: folderCounter, childs: dataItem.childs },
        });
      folderCounter++;

      await dynamoDb.update(params).promise();
      let innerCount = 0;
      for (const child of dataItem.childs) {
        const params: DynamoDB.DocumentClient.UpdateItemInput =
          buildUpdateExpression({
            keys: {
              id: `${child.id}`,
              slug: `${child.slug}`,
            },
            tableName: `${RESOURCES[resource]}-${STAGE}`,
            item: { sort_order: innerCount },
          });
        innerCount++;

        await dynamoDb.update(params).promise();
      }
    }

    return {
      statusCode: 200,
      body: { message: "Items sorted." },
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
