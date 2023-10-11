import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCOUNT_DOCUMENT;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const account_id: string = event.headers["account-id"] as string;
  const document_type_slug = event.queryStringParameters?.document_type_slug;
  const title = event.queryStringParameters?.title;

  let useGsi;

  if (title || document_type_slug) useGsi = true;

  let conditionSlug = "false:";
  if (useGsi && document_type_slug && title) {
    conditionSlug += `${document_type_slug}:${title}`;
  } else if (document_type_slug) {
    conditionSlug += `${document_type_slug}`;
  }

  const params: DynamoDB.DocumentClient.QueryInput = {
    TableName: TABLE_NAME,
    IndexName: useGsi ? "document_title_type_gsi_index" : undefined,
    KeyConditionExpression: "#id = :id AND begins_with(#slug,:slug)",
    ExpressionAttributeNames: {
      "#id": "id",
      "#slug": useGsi ? "document_title_type" : "slug",
    },
    ExpressionAttributeValues: {
      ":id": `${account_id}`,
      ":slug": conditionSlug,
    },
  };
  console.log("params", { document_type_slug, title, params });
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

export const handler = middy(lambdaHandler, { timeoutEarlyInMillis: 0 })
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
  ); // handles common http errors and returns proper responses
