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
import { PresentationSlides } from "types";
import {
  ACCOUNT_PRESNTATION_SLIDES_TABLE_NAME,
  envTableNames,
} from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_PRESENTATIONS;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        data: {
          type: "array",
        },
      },
      required: ["data"],
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
  const { data } = event.body;
  const accountId: string = event.headers["account-id"] as string;
  const presentationId = event.queryStringParameters!.presentation_id;

  try {
    if (!data?.length) {
      return {
        statusCode: 404,
        body: "No data found",
      };
    }

    for (const itm of data as PresentationSlides[]) {
      const params: DynamoDB.DocumentClient.UpdateItemInput =
        buildUpdateExpression({
          keys: {
            id: `${accountId}:${presentationId}:${ACCOUNT_PRESNTATION_SLIDES_TABLE_NAME}`,
            slug: `${itm.slug}`,
          },
          tableName: TABLE_NAME,
          item: { sort_number: itm.sort_number },
        });

      await dynamoDb.update(params).promise();
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
