import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { envTableNames } from "../../config";
import { FusionLambda } from "../../constants/3pApp";
import { InvocationType } from "../../enums/lambda";
import { invokeLambda } from "../../helpers/lambda";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { isValidJson } from "../../util/index";

const dynamodb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
    },
  },
  required: ["body"],
} as const;

const tableName = `${envTableNames.DYNAMODB_ACCT_FUSIONS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const slug = event.pathParameters?.["slug"];
  const {
    userId,
    accountId,
    chart_inputs = {},
    sessionInitVars = {},
  } = event.body;

  const { Item: fusion } = await dynamodb
    .get({
      TableName: tableName,
      Key: { id: `${accountId}:fusions`, slug },
    })
    .promise();

  if (!fusion) {
    throw createHttpError(
      400,
      new Error(`Fusion doesn't exists against slug: ${slug}`),
      { expose: true }
    );
  }

  const lambdaResponse = await invokeLambda(
    FusionLambda.SessionInt,
    {
      fusionSlug: slug,
      fusion,
      accountId: fusion.account_id,
      userId,
      chartInputs: chart_inputs,
      sessionInitVars,
    },
    InvocationType.RequestResponse,
    { roundRobin: true }
  );

  const sessionSlug = isValidJson(lambdaResponse.Payload as string);

  return {
    statusCode: 200,
    body: {
      message: "Fusion execution started",
      data: {
        sessionSlug,
      },
    },
  };
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
