import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { GFMLFunction } from "../../types";

const dynamodb = new DynamoDB.DocumentClient();

const globalFunctionsTableName = `${envTableNames.DYNAMODB_ACCT_GLOBAL_GFML_FUNCTIONS}`;
const accountId = "global";
const newAccountId = "3p:global";

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  unknown
> = async () => {
  await createGlobalGFMLFunctions();
};

const createGlobalGFMLFunctions = async () => {
  const failedGFMLFunctions = [];
  let gfmlFunctions: GFMLFunction[] = [];

  try {
    const { Items = [] } = await dynamodb
      .query({
        TableName: globalFunctionsTableName,
        KeyConditionExpression: "#id = :id",
        FilterExpression: "#is_deleted = :is_deleted",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
          "#id": "id",
        },
        ExpressionAttributeValues: {
          ":id": `${accountId}:global_gfml_functions`,
          ":is_deleted": false,
        },
      })
      .promise();
    gfmlFunctions = Items as GFMLFunction[];
    console.log("Items: ", Items.length);
  } catch (err) {
    console.log(`Error getting gfml functions for ${err}`);
    failedGFMLFunctions.push({
      error: (err as Error).message,
    });

    return failedGFMLFunctions;
  }

  for (const func of gfmlFunctions) {
    try {
      console.log("creating gfml function: ", func.slug);
      const now = new Date().toISOString();

      const tableParams = {
        TableName: globalFunctionsTableName,
        Item: {
          ...func,
          id: `${newAccountId}:global_gfml_functions`,
          is_active: true,
          is_deleted: false,
          created_at: now,
          updated_at: null,
        },
      };
      await dynamodb.put(tableParams).promise();
    } catch (err) {
      console.log(`GFML function Error: ${func.slug} ${err}`);
      failedGFMLFunctions.push({
        slug: func.slug,
        error: (err as Error).message,
      });
    }
  }

  return failedGFMLFunctions;
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
