import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import { default as createError } from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account, DatasetDesign } from "types";
import { Dataset } from "types/Dataset";
import { ACCOUNT_DATASET_DESIGN_TABLE_NAME, envTableNames } from "../../config";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();

const staticKeys = [
  "id",
  "title",
  "is_active",
  "is_deleted",
  "updated_at",
  "created_at",
];
const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const slug = event.pathParameters!.slug;
  const datasetDesignSlug = event.pathParameters!.datasetDesignSlug;
  const accountId: string = event.headers["account-id"] as string;
  const account = (event as any).account as Account;
  const databaseName = account.database_name;

  const datasetDesignParams: DynamoDB.DocumentClient.GetItemInput = {
    TableName: envTableNames.DYNAMODB_ACCT_DATASET_DESIGN,
    Key: {
      id: `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`,
      slug: datasetDesignSlug,
    },
  };

  try {
    const { Item } = await dynamoDb.get(datasetDesignParams).promise();
    const datasetDesign = Item as DatasetDesign;

    //Get all the field defined in datasetDesign;

    const includedKeys = // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      datasetDesign?.fields?.fields?.map((f: { slug: string }) => f.slug) || [];


    const connectionKnex = await connectKnex(account.database_name);

    const query = connectionKnex<
      Omit<Dataset, "fields"> & { [key: string]: any }
    >(datasetDesign.sql_table_name)
      .where({ id: slug })
      .first()
      .select([...staticKeys, ...includedKeys]);

    // console.log({ query: query.toQuery() });
    const datasetRaw = await query;
    // console.log({ message: "invalid params", params: { slug } });
    if (!datasetRaw?.id)
      return {
        statusCode: 400,
        message: "invalid params",
        data: { message: "invalid params", params: { slug } },
      };

    const processedDataset: { [key: string]: any } = { fields: {} };

    Object.keys(datasetRaw).forEach((key) => {
      if (staticKeys.includes(key)) {
        processedDataset[key] = datasetRaw[key];
      } else {
        processedDataset["fields"][key] = datasetRaw[key];
      }
    });

    return {
      statusCode: 200,
      body: { data: processedDataset },
    };

  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    console.log("error:-", error);
    throw createError(err?.statusCode || 500, err, { expose: true });
  }
};

export const handler = middy()
  .use(httpErrorHandler()) // handles common http errors and returns proper responses
  .use(jsonschemaErrors())
  .use(getAccountData())
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
