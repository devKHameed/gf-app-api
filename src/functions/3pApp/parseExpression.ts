import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { parseExpression } from "../../helpers/3pExpression";
import { parseTagsToExpression } from "../../helpers/3pExpression/tagsParser";
import { getGlobalGFMLFunctions } from "../../helpers/gfmlFunctions";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
    },
  },
  required: ["body"],
} as const;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const { expression, data, account_id, app, type } = event.body;
    if (type === "tags") {
      return {
        statusCode: 200,
        body: parseTagsToExpression(expression as string),
      };
    }
    const functions = await getGlobalGFMLFunctions("global");
    const accountFuncs = await getGlobalGFMLFunctions(account_id as string);
    console.log("🚀 ~ file: parseExpression.ts:27 ~ >= ~ functions", functions);
    const res = await parseExpression<unknown>(expression, {
      body: data as Record<string, unknown>,
      responses: {},
      mappableParameters: [],
      accountId: account_id as string,
      functions: [...functions, ...accountFuncs],
    });
    console.log("🚀 ~ file: parseExpression.ts:35 ~ >= ~ res", res);

    return {
      statusCode: 200,
      body: {
        result: res,
      },
      headers: {
        abc: "*",
      },
    };
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
};

export const handler = middy()
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
