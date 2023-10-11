import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamodb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        data: {
          type: "object",
        },
      },
      required: ["data"],
    },
  },
  required: ["body"],
} as const;

const fusionTableName = `${envTableNames.DYNAMODB_ACCT_FUSIONS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const { data } = event.body;

    const accountId = event.headers["account-id"];
    const folderId = event.queryStringParameters?.folderId ?? "root";

    data.id = `${accountId}:fusions`;
    data.folder_id = folderId;

    const { Item } = await dynamodb
      .get({
        TableName: fusionTableName,
        Key: {
          id: `${accountId}:fusions`,
          slug: data.slug,
        },
      })
      .promise();

    data.fusion_title = data.fusion_title
      ? `${data.fusion_title} - Copy`
      : "New Fusion";
    if (Item) {
      const newSLug = `${data.slug}${Math.floor(
        Math.random() * (999 - 100 + 1) + 100
      )}`;
      data.slug = newSLug;
      data.fusion_slug = newSLug;
    }

    const tableParams: DynamoDB.DocumentClient.PutItemInput = {
      TableName: fusionTableName,
      Item: data,
    };

    await dynamodb.put(tableParams).promise();

    return {
      statusCode: 200,
      body: {
        data: tableParams.Item,
      },
    };
  } catch (e) {
    throw createHttpError(400, e as Error, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  // .use(validator({ eventSchema })) // validates the input
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
