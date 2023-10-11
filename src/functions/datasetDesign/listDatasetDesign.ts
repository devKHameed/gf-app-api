import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { ACCOUNT_DATASET_DESIGN_TABLE_NAME, envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_DATASET_DESIGN;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const accountId: string = event.headers["account-id"] as string;

  const params: DynamoDB.DocumentClient.QueryInput = {
    TableName: TABLE_NAME,
    IndexName: "is_deleted_lsi_index",
    KeyConditionExpression: "#id = :id AND #is_deleted = :is_deleted",
    ExpressionAttributeNames: {
      "#id": "id",
      "#is_deleted": "is_deleted",
    },
    ExpressionAttributeValues: {
      ":id": `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`,
      ":is_deleted": 0,
    },
  };

  try {
    // fetch data from the database
    const { Items } = await dynamoDb.query(params).promise();
    //TODO: Add Pagination generic function
    return {
      statusCode: 200,
      body: { message: "List of document design", data: Items },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
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
