import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account, AccountUser, DatasetDesign } from "types";
import { ACCOUNT_DATASET_DESIGN_TABLE_NAME, envTableNames } from "../../config";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { createUniversalEvent } from "../universalEvent/createUniversalEvent";

const dynamoDb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
    },
  },
} as const;

export const RequsetUpdateDatasetBody = {
  title: "RequsetUpdateDatasetBody",
  RequsetUpdateDatasetBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
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

    const connectionKnex = await connectKnex(databaseName);
    await connectionKnex(datasetDesign.sql_table_name)
      .where({ id: slug })
      .update({
        is_deleted: 1,
      })
      .then(() => console.log("data update"));
    await createUniversalEvent({
      recordId: slug!,
      recordType: "dataset_record",
      accountId: accountId,
      eventSlug: "delete",
      eventData: {},
      userId: (event.user as AccountUser).slug,
    });
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
  // .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  // .use(validator({ eventSchema })) // validates the input
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
