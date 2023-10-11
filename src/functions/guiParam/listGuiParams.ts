import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { GUI_PARAMS, envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_GF_GUIS;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const guiId = event.queryStringParameters!.gui_id;
  // fetch all guis from the database
  const params: DynamoDB.DocumentClient.QueryInput = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
    ExpressionAttributeNames: {
      "#id": "id",
      "#slug": "slug",
    },
    ExpressionAttributeValues: {
      ":id": `${GUI_PARAMS}`,
      ":slug": `${guiId}:`,
    },
  };

  try {
    // fetch data from the database
    const { Items } = await dynamoDb.query(params).promise();
    return {
      statusCode: 200,
      body: { message: "List of guis", data: Items },
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
  ) // handles common http errors and returns proper responses
  .handler(lambdaHandler);
