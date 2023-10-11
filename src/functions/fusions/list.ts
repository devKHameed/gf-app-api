import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { isEmpty } from "lodash";
import { Fusion } from "types";
import { envTableNames } from "../../config";
import { FusionType } from "../../enums/fusion";
import { dynamodb } from "../../helpers/db";
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

const tableName = `${envTableNames.DYNAMODB_ACCT_FUSIONS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId = event.headers["account-id"];
    const type = event.queryStringParameters?.type || "fusion";
    const lastEvaluatedKey = JSON.parse(
      event.queryStringParameters?.cursor ?? "{}"
    );
    const folderId = event.queryStringParameters?.folder;

    let startKey: DocumentClient.Key | undefined = undefined;
    let expression = "#id = :id";
    const names: DocumentClient.ExpressionAttributeNameMap = {
      "#id": "id",
      "#is_deleted": "is_deleted",
    };
    const values: DocumentClient.ExpressionAttributeValueMap = {
      ":id": `${accountId}:fusions`,
      ":is_deleted": 0,
    };

    if (folderId) {
      expression += " AND #folder_id = :folder_id";
      names["#folder_id"] = "folder_id";
      values[":folder_id"] = folderId;
    }

    if (!isEmpty(lastEvaluatedKey)) {
      startKey = lastEvaluatedKey;
    }

    const { Items = [], LastEvaluatedKey } = await dynamodb.query(
      {
        TableName: tableName,
        FilterExpression: "#is_deleted = :is_deleted",
        IndexName: "folder_id_gsi",
        KeyConditionExpression: expression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ExclusiveStartKey: startKey,
      },
      2
    );

    let fusions = Items as Fusion[];

    if (type === "skill_design") {
      fusions = fusions.filter((f) => f.fusion_type === FusionType.Skills);
    } else if (type === "adventure") {
      fusions = fusions.filter((f) => f.fusion_type === FusionType.Adventure);
    } else if (type === "double_talk") {
      fusions = fusions.filter((f) => f.fusion_type === FusionType.DoubleTalk);
    } else if (type === "saline_chat") {
      fusions = fusions.filter((f) => f.fusion_type === FusionType.SalineChat);
    } else if (type === "fusion") {
      fusions = fusions.filter((f) => f.fusion_type !== FusionType.Skills);
    }

    return {
      statusCode: 200,
      body: {
        data: fusions,
        count: fusions.length,
        cursor: LastEvaluatedKey,
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
