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
import * as uuid from "uuid";
import {
  ACCOUNT_DATASET_DESIGN_TABLE_NAME,
  FOLDERS,
  envTableNames,
} from "../../config";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";
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
        dataset_slug: {
          type: "string",
        },
        name: {
          type: "string",
        },
        description: {
          type: "string",
        },
        parent_type: {
          type: "number",
          default: 0,
        },
        parent_id: {
          type: "number",
          default: 0,
        },
        color: {
          type: "string",
        },
        icon: {
          type: "string",
        },
        fields: {
          type: "object",
          default: {},
        },
        folder: {
          type: "string",
        },
      },
      required: ["dataset_slug", "name", "folder"],
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
  const {
    dataset_slug,
    name,
    parent_type,
    parent_id,
    color,
    description,
    icon,
    fields,
    folder: folderSlug,
  } = event.body;
  const accountId: string = event.headers["account-id"] as string;
  const account = event.account as Account;
  const databaseName = account.database_name;

  if (!(event.user as AccountUser).slug)
    throw createError("user does not exists!");

  const slug = `${parent_type}:${uuid.v4()}`;
  const sqlTableName = validSqlTableName(slug);

  const datasetDesignParams: DynamoDB.DocumentClient.PutItemInput = {
    TableName: TABLE_NAME,
    Item: {
      id: `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`,
      slug: slug,
      sql_table_name: sqlTableName,
      dataset_slug,
      name,
      parent_type,
      parent_id,
      color,
      fields,
      description,
      icon,
      created_at: new Date().toISOString(),
      updated_at: null,
      is_active: 1,
      is_deleted: 0,
    },
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
    // await connectionKnex.schema.table(sqlTableName, function (table) {
    //   table.index("title");
    // });

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
