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
import { Account, AccountUser, Folder } from "types";
import {
  ACCOUNT_DATASET_DESIGN_TABLE_NAME,
  FOLDERS,
  envTableNames,
} from "../../config";
import { DataField } from "../../constants/dataset";
import connectKnex from "../../helpers/knex/connect";
import duplicateSlugCheck from "../../middleware/duplicateSlugCheck";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";
import alterTable from "../../util/dataset/alterTable";
import validSqlTableName from "../../util/dataset/validSqlTableName";
import { createUniversalEvent } from "../universalEvent/createUniversalEvent";

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_DATASET_DESIGN;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        data: {
          type: "object",
        },
        folder: {
          type: "string",
        },
      },
      required: ["data", "folder"],
    },
  },
  required: ["body"],
} as const;

export const RequsetCreateDatasetDesignBody = {
  title: "RequsetCreateDatasetDesignBody",
  RequsetCreateDatasetDesignBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { data, folder: folderSlug } = event.body;
  const accountId: string = event.headers["account-id"] as string;
  const account = event.account as Account;
  const databaseName = account.database_name;

  if (!(event.user as AccountUser).slug)
    throw createError("user does not exists!");

  const slug = `${data.slug}`;
  const sqlTableName = validSqlTableName(slug);
  data.id = `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`;
  data.slug = slug;
  data.sql_table_name = sqlTableName;
  data.created_at = new Date().toISOString();
  data.updated_at = null;

  const datasetDesignParams: DynamoDB.DocumentClient.PutItemInput = {
    TableName: TABLE_NAME,
    Item: data,
  };

  try {
    let folder: undefined | Folder = undefined;
    if (folderSlug) {
      const { Item } = await dynamoDb
        .get({
          TableName: `${envTableNames.DYNAMODB_ACCT_FOLDERS}`,
          Key: { id: `${accountId}:${FOLDERS}`, slug: folderSlug },
        })
        .promise();
      folder = Item as Folder;
    }

    if (folder?.slug) {
      const childs: Array<object> = folder.childs;

      childs.push({
        id: `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`,
        slug: slug,
      });

      const params: DynamoDB.DocumentClient.UpdateItemInput =
        buildUpdateExpression({
          tableName: envTableNames.DYNAMODB_ACCT_FOLDERS,
          keys: {
            id: `${accountId}:${FOLDERS}`,
            slug: folder.slug,
          },
          item: {
            childs: childs,
          },
        });

      await dynamoDb.update(params).promise();
    }

    await createUniversalEvent({
      recordId: slug,
      recordType: "dataset_design",
      accountId: accountId,
      eventSlug: "created",
      eventData: datasetDesignParams.Item,
      userId: (event.user as AccountUser).slug,
    });

    await dynamoDb.put(datasetDesignParams).promise();

    const connectionKnex = await connectKnex(databaseName);

    //create-dataset-table
    await connectionKnex.schema.createTable(sqlTableName, function (table) {
      table.increments("id").primary();
      table.string("dataset_type_slug").notNullable();
      table.string("title");
      table.boolean("is_active").defaultTo(true);
      table.boolean("is_deleted").defaultTo(false);
      table.timestamps(true, true);
    });

    const datasetDesignfields = data?.fields as Record<string, unknown>;

    if (
      sqlTableName &&
      databaseName &&
      (datasetDesignfields?.fields as DataField[])?.length
    ) {
      const connectionKnex = await connectKnex(databaseName);
      //alter table for dataset record
      await alterTable({
        knex: connectionKnex,
        tableName: sqlTableName,
        oldFields: [],
        newFields: (datasetDesignfields?.fields as DataField[]) || [],
      });
    }

    return {
      statusCode: 201,
      body: { data: datasetDesignParams.Item },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
  .use(jsonschemaErrors())
  .use(httpErrorHandler())
  .use(getAccountData())
  .use(
    duplicateSlugCheck({
      tableName: TABLE_NAME,
      getKey: (accountId, _, event) => ({
        id:  `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`,
        slug: event.body.data.slug,
      }),
    })
  )
  .use(getUser())
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
