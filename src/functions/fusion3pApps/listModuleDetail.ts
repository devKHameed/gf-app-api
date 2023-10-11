import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import _ from "lodash";
import { Fusion } from "types/Fusion";
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

const tableName = `${envTableNames.DYNAMODB_ACCT_3P_ACTIONS}`;
const fusionTableName = `${envTableNames.DYNAMODB_ACCT_FUSIONS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId = event.headers["account-id"];
    const id = event.pathParameters?.["id"] || "";

    const { Item } = await dynamodb
      .get({
        TableName: fusionTableName,
        Key: {
          id: `${accountId}:fusions`,
          slug: id,
        },
      })
      .promise();
    const fusion = Item as Fusion;
    if (!Item) {
      throw {
        message: `Fusion doesn't exists against this id=${id}`,
        code: 404,
      };
    }
    if (fusion?.fusion_operators) {
      const modulesData = [];
      const operators = (fusion.fusion_operators || [])?.filter(
        (op) => op.app !== "system"
      );
      const appModules = operators.reduce<
        Record<string, { app: string; app_module: string; app_id: string }>
      >((acc, cur) => {
        if (!acc[cur.app_module]) {
          acc[cur.app_module] = {
            app: cur.app,
            app_module: cur.app_module,
            app_id: cur.app_id || (cur as any).appId,
          };
        }
        return acc;
      }, {});
      for (const appModule of Object.values(appModules)) {
        const { Item: module } = await dynamodb
          .get({
            TableName: tableName,
            Key: {
              id: `${
                appModule.app_id?.startsWith("global") ? "global" : accountId
              }:3p_app_actions`,
              slug: appModule.app_module,
            },
          })
          .promise()
          .then((res) => res)
          .catch((err) => {
            console.log({
              id: `${
                appModule.app_id?.startsWith("global") ? "global" : accountId
              }:3p_app_actions`,
              slug: appModule.app_module,
            });
            console.log(err);

            return { Item: null };
          });
        if (_.size(module)) {
          modulesData.push(module);
        }
      }
      return {
        statusCode: 200,
        body: { data: modulesData, count: modulesData.length },
      };
    } else {
      return {
        statusCode: 200,
        body: { message: "Fusion operators doesn't exists" },
      };
    }
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
