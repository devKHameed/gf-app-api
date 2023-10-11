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
import { Account, AccountUser, DatasetDesign } from "types";
import { ACCOUNT_DATASET_DESIGN_TABLE_NAME, envTableNames } from "../../config";
import { DocumentElementType } from "../../constants/dataset";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import updateValue from "../../util/dataset/updateValue";
import { createUniversalEvent } from "../universalEvent/createUniversalEvent";

const dynamoDb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        title: {
          type: "string",
        },
        fields: {
          type: "object",
        },
      },
    },
  },
  required: ["body"],
} as const;

export const RequsetUpdateDatasetBody = {
  title: "RequsetUpdateDatasetBody",
  RequsetUpdateDatasetBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { title, fields: requestField = {} } = event.body;
  const slug = event.pathParameters?.slug;
  const datasetDesignSlug = event.pathParameters?.datasetDesignSlug;
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


    const connectionKnex = await connectKnex(account.database_name);
    await updateValue({
      knex: connectionKnex,
      tableName: datasetDesign.sql_table_name,
      dynamicData: requestField,
      staticData: { title },
      fields:
        (datasetDesign?.fields?.fields as {
          slug: string;
          type: `${DocumentElementType}`;
        }[]) || [],
      where: { id: slug },
    });

    await createUniversalEvent({
      recordId: slug!,
      recordType: "dataset_record",
      accountId: accountId,
      eventSlug: "edit",
      eventData: { title, requestField },
      userId: (event.user as AccountUser).slug,
    });


    //TODO: If user need send back the data
    return {
      statusCode: 200,
      body: { message: "update successfully" },
    };
  } catch (error: unknown) {
    console.log("error", error);
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
  .use(jsonschemaErrors())
  .use(httpErrorHandler())
  .use(getUser())
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
  .handler(lambdaHandler); // handles common http errors and returns proper responses
