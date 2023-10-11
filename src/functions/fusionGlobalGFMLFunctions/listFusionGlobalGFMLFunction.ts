import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import pick from "lodash/pick";
import { GFMLFunction, GFMLFunctionGroup } from "types/Fusion/3pApp";
import { envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

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

const TABLE_NAME = envTableNames.DYNAMODB_ACCT_GLOBAL_GFML_FUNCTIONS;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId = event.headers["account-id"];
    const includeGlobal = event.queryStringParameters?.["include"] === "global";

    const gfmlFunctions = await dynamodb
      .query({
        TableName: TABLE_NAME,
        FilterExpression:
          "#is_active = :is_active AND #is_deleted = :is_deleted",
        KeyConditionExpression: "#id = :id",
        ExpressionAttributeNames: {
          "#is_active": "is_active",
          "#is_deleted": "is_deleted",
          "#id": "id",
        },
        ExpressionAttributeValues: {
          ":id": `3p:${accountId}:global_gfml_functions`,
          ":is_deleted": false,
          ":is_active": true,
        },
      })
      .promise()
      .then((res) => (res.Items as GFMLFunction[]) || []);

    if (includeGlobal) {
      await dynamodb
        .query({
          TableName: TABLE_NAME,
          FilterExpression:
            "#is_active = :is_active AND #is_deleted = :is_deleted",
          KeyConditionExpression: "#id = :id",
          ExpressionAttributeNames: {
            "#is_active": "is_active",
            "#is_deleted": "is_deleted",
            "#id": "id",
          },
          ExpressionAttributeValues: {
            ":id": "3p:global:global_gfml_functions",
            ":is_active": true,
            ":is_deleted": false,
          },
        })
        .promise()
        .then((res) =>
          gfmlFunctions.unshift(...((res.Items as GFMLFunction[]) || []))
        );
    }

    const groups = gfmlFunctions.reduce<Partial<GFMLFunctionGroup>[]>(
      (acc, cur) => {
        const func: Partial<GFMLFunction> = pick(cur, [
          "function_title",
          "function_slug",
          "function_subtitle",
          "function_button_title",
          "slug",
          "id",
        ]);
        const groupIdx = acc.findIndex(
          (g) => g.function_group_name === cur.function_group
        );
        if (groupIdx > -1) {
          const subGroups = acc[groupIdx].function_group_sub_groups!;
          const subGroupIdx =
            subGroups.findIndex(
              (s) => s.function_sub_group_name === cur.function_sub_group
            ) ?? -1;
          if (subGroupIdx > -1) {
            subGroups[subGroupIdx].functions.push(func);
          } else {
            subGroups.push({
              function_sub_group_name: cur.function_sub_group,
              functions: [func],
            });
          }
        } else {
          acc.push({
            function_group_name: cur.function_group,
            function_group_sub_groups: [
              {
                function_sub_group_name: cur.function_sub_group,
                functions: [func],
              },
            ],
          });
        }
        return acc;
      },
      []
    );

    return {
      statusCode: 200,
      body: {
        data: groups,
      },
    };
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
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
