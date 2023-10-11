import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import { HttpStatusCode } from "axios";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account, AccountUser, DatasetDesign, Folder } from "types";
import {
  ACCOUNT_DATASET_DESIGN_TABLE_NAME,
  FOLDERS,
  envTableNames,
} from "../../config";
import { DataField } from "../../constants/dataset";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";
import alterTable from "../../util/dataset/alterTable";
import { createUniversalEvent } from "../universalEvent/createUniversalEvent";
const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_DATASET_DESIGN;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        name: {
          type: "string",
        },
        description: {
          type: "string",
        },
        color: {
          type: "string",
        },
        fields: {
          type: "object",
        },
        icon: {
          type: "string",
        },
        folder: {
          type: "string",
        },
        previous_folder: {
          type: "string",
        },
      },
    },
  },
  required: ["body"],
} as const;

export const RequsetUpdateDatasetDesignBody = {
  title: "RequsetUpdateDatasetDesignBody",
  RequsetUpdateDatasetDesignBody: eventSchema.properties.body,
};

const updateFolder = async ({
  oldFolderSlug,
  newFolderSlug,
  itemSlug,
  accountId,
}: {
  accountId: string;
  oldFolderSlug: string;
  newFolderSlug: string;
  itemSlug: string;
}) => {
  const [oldFolder, newFolder] = (await Promise.all([
    dynamoDb
      .get({
        TableName: `${envTableNames.DYNAMODB_ACCT_FOLDERS}`,
        Key: { id: `${accountId}:${FOLDERS}`, slug: oldFolderSlug },
      })
      .promise(),
    dynamoDb
      .get({
        TableName: `${envTableNames.DYNAMODB_ACCT_FOLDERS}`,
        Key: { id: `${accountId}:${FOLDERS}`, slug: newFolderSlug },
      })
      .promise(),
  ]).then((res) => {
    return [res[0].Item, res[1].Item];
  })) as [Folder, Folder];

  //Remove from olderFolder childs;
  const folderUpdatePromise = [];
  if (oldFolder) {
    const index = oldFolder.childs.findIndex((c) => c.slug === itemSlug);
    if (index !== -1) {
      oldFolder.childs.splice(index, 1);
      folderUpdatePromise.push(
        dynamoDb
          .update(
            buildUpdateExpression({
              tableName: `${envTableNames.DYNAMODB_ACCT_FOLDERS}`,
              keys: { id: `${accountId}:${FOLDERS}`, slug: oldFolderSlug },
              item: { childs: oldFolder.childs },
            })
          )
          .promise()
      );
    }
  }
  if (newFolder) {
    folderUpdatePromise.push(
      dynamoDb
        .update(
          buildUpdateExpression({
            tableName: `${envTableNames.DYNAMODB_ACCT_FOLDERS}`,
            keys: { id: `${accountId}:${FOLDERS}`, slug: newFolderSlug },
            item: {
              childs: [
                ...newFolder.childs,
                {
                  slug: itemSlug,
                  id: `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`,
                },
              ],
            },
          })
        )
        .promise()
    );
  }
  await Promise.all(folderUpdatePromise);
};
const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const slug = event.pathParameters!.slug;
  const accountId = event.headers["account-id"] as string;
  const account = event.account as Account;
  const databaseName = account.database_name;
  const { name, color, description, icon, fields, folder, previous_folder } =
    event.body;
  const user = (event as any).user as AccountUser;

  if (!user.slug) throw createError("user does not exists!");

  const getDatasetDesign: DynamoDB.DocumentClient.GetItemInput = {
    TableName: TABLE_NAME,
    Key: {
      id: `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`,
      slug: slug,
    },
  };
  const params: DynamoDB.DocumentClient.UpdateItemInput = buildUpdateExpression(
    {
      tableName: TABLE_NAME,
      keys: {
        id: `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`,
        slug: slug!,
      },
      item: {
        name,
        color,
        description,
        icon,
        fields,
      },
    }
  );

  try {
    const { Item } = await dynamoDb.get(getDatasetDesign).promise();
    const datasetDesign = Item as DatasetDesign;

    if (
      fields?.fields &&
      Array.isArray(fields?.fields)
    ) {
      const connectionKnex = await connectKnex(databaseName);
      //alter table for dataset record
      await alterTable({
        knex: connectionKnex,
        tableName: datasetDesign.sql_table_name,
        oldFields: datasetDesign.fields?.fields || [],
        newFields: (fields?.fields as DataField[]) || [],
      });
    }
    await createUniversalEvent({
      recordId: slug!,
      recordType: "dataset_design",
      accountId: accountId,
      eventSlug: "edit",
      eventData: { name, color, fields },
      userId: user?.slug,
    });

    await dynamoDb.update(params).promise();

    if (folder && previous_folder) {
      await updateFolder({
        oldFolderSlug: previous_folder,
        newFolderSlug: folder,
        itemSlug: slug!,
        accountId,
      });
    }
    //TODO: If user need send back the data
    return {
      statusCode: 200,
      body: { message: "update successfully" },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    console.log(err);
    throw createError(
      err.statusCode || HttpStatusCode.InternalServerError,
      err,
      { expose: true }
    );
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
