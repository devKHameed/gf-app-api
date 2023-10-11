import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { DatasetDesign, Folder } from "types";
import {
  ACCOUNT_DATASET_DESIGN_TABLE_NAME,
  FOLDERS,
  envTableNames,
} from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_DATASET_DESIGN;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const slug = event.pathParameters!.slug;
  const accountId: string = event.headers["account-id"] as string;

  const folderParams: DynamoDB.DocumentClient.GetItemInput = {
    TableName: envTableNames.DYNAMODB_ACCT_FOLDERS,
    Key: {
      id: `${accountId}:${FOLDERS}`,
      slug: slug,
    },
  };

  try {
    const datasetDesigns = [];
    const { Item } = await dynamoDb.get(folderParams).promise();
    const folder: Folder = Item as Folder;

    if (folder?.slug) {
      for (const itm of folder.childs) {
        const params: DynamoDB.DocumentClient.GetItemInput = {
          TableName: TABLE_NAME,
          Key: {
            id: `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`,
            slug: itm.slug,
          },
        };

        const { Item } = await dynamoDb.get(params).promise();
        const dataset_design: DatasetDesign = Item as DatasetDesign;
        datasetDesigns.push(dataset_design);
      }
    }

    //TODO: Add condition if the item doens't exist
    return {
      statusCode: 200,
      body: { data: datasetDesigns },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(httpErrorHandler()) // handles common http errors and returns proper responses
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
  )
  .handler(lambdaHandler);
