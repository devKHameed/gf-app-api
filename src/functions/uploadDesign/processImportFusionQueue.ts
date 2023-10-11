import middy from "@middy/core";
import { EventBridgeHandler } from "aws-lambda";
import { Account } from "types";
import {
  ACCOUNTS_TABLE_NAME,
  ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
  envTableNames,
} from "../../config";
import { FusionLambda } from "../../constants/3pApp";
import { InvocationType } from "../../enums/lambda";
import { dynamodb } from "../../helpers/db";
import { invokeLambda } from "../../helpers/lambda";
import { ImportChunk } from "../../types/UploadDesign";
import buildUpdateExpression from "../../util/buildUpdateExpression";
import { getFusion } from "../../util/fusion";

const queueTable = envTableNames.DYNAMODB_ACCT_FUSIONS_QUEUE;
const importTableName = envTableNames.DYNAMODB_ACCT_IMPORTER_UPLOADS;
const accountSettingsTable = envTableNames.DYNAMODB_GLOBAL_ACCOUNT_SETTINGS;

const getAccounts = async () => {
  const { Items: accounts } = await dynamodb.query({
    TableName: accountSettingsTable,
    KeyConditionExpression: "#id = :id",
    ExpressionAttributeValues: {
      ":id": ACCOUNTS_TABLE_NAME,
    },
    ExpressionAttributeNames: {
      "#id": "id",
    },
  });

  return accounts as Account[];
};

export const lambdaHandler: EventBridgeHandler<
  "",
  unknown,
  void
> = async () => {
  const accounts = await getAccounts();

  for (const account of accounts) {
    const { Items: processingImports = [] } = await dynamodb.query({
      TableName: importTableName,
      IndexName: "status_lsi",
      KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
      ExpressionAttributeNames: {
        "#id": "status",
        "#slug": "slug",
      },
      ExpressionAttributeValues: {
        ":id": "Processing",
        ":slug": account.slug,
      },
      Limit: 1,
    });
    console.log(
      "🚀 ~ file: processImportFusionQueue.ts:45 ~ >= ~ processingImports:",
      processingImports
    );

    if (processingImports.length > 0) {
      continue;
    }

    const { Items: pendingImports = [] } = await dynamodb.query({
      TableName: importTableName,
      IndexName: "status_lsi",
      KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
      ExpressionAttributeNames: {
        "#id": "status",
        "#slug": "slug",
      },
      ExpressionAttributeValues: {
        ":id": "Pending",
        ":slug": account.slug,
      },
      Limit: 1,
    });

    if (pendingImports.length === 0) {
      continue;
    }

    const { Items = [] } = await dynamodb.query({
      TableName: queueTable,
      IndexName: "chunk_status_gsi",
      KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
      ExpressionAttributeNames: {
        "#id": "chunk_status",
        "#slug": "slug",
      },
      ExpressionAttributeValues: {
        ":id": "Pending",
        ":slug": `${account.slug}:${pendingImports[0].slug}`,
      },
      Limit: 1,
    });

    if (Items.length === 0) {
      continue;
    }

    const nextChunk = Items[0] as ImportChunk;

    await dynamodb.update(
      buildUpdateExpression({
        tableName: importTableName,
        keys: {
          id: ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
          slug: nextChunk.parent_slug,
        },
        item: {
          status: "Processing",
        },
      })
    );

    await dynamodb.update(
      buildUpdateExpression({
        tableName: queueTable,
        keys: {
          id: nextChunk.id,
          slug: nextChunk.slug,
        },
        item: {
          chunk_status: "Processing",
        },
      })
    );

    const fusion = await getFusion(
      nextChunk.target_fusion,
      nextChunk.account_id
    );

    if (nextChunk.type === "csv") {
      for (const [idx, chunk] of nextChunk.chunk_data.entries()) {
        await invokeLambda(
          FusionLambda.SessionInt,
          {
            fusionSlug: nextChunk.target_fusion,
            popupVariables: { popup_variables: { data: chunk } },
            userId: nextChunk.user_id,
            fusion,
            accountId: nextChunk.account_id,
            importChunk: nextChunk,
            chunkIndex: idx,
          },
          InvocationType.Event,
          { roundRobin: true }
        );
      }
    } else {
      let popupVariables: Record<string, unknown> = {};
      if (nextChunk.type === "image") {
        popupVariables = {
          image_url: nextChunk.chunk_data.file_url,
          image_file: {
            type: "s3_file",
            s3_url: nextChunk.chunk_data.file_url,
          },
          image_filename: nextChunk.chunk_data.filename,
          image_file_type: nextChunk.chunk_data.type,
        };
      } else if (nextChunk.type === "word_doc") {
        popupVariables = {
          doc_url: nextChunk.chunk_data.file_url,
          doc_file: { type: "s3_file", s3_url: nextChunk.chunk_data.file_url },
          doc_filename: nextChunk.chunk_data.filename,
          doc_file_type: nextChunk.chunk_data.type,
        };
      } else if (nextChunk.type === "audio") {
        popupVariables = {
          audio_url: nextChunk.chunk_data.file_url,
          audio_file: {
            type: "s3_file",
            s3_url: nextChunk.chunk_data.file_url,
          },
          audio_filename: nextChunk.chunk_data.filename,
          audio_file_type: nextChunk.chunk_data.type,
        };
      } else if (nextChunk.type === "video") {
        popupVariables = {
          video_url: nextChunk.chunk_data.file_url,
          video_file: {
            type: "s3_file",
            s3_url: nextChunk.chunk_data.file_url,
          },
          video_filename: nextChunk.chunk_data.filename,
          video_file_type: nextChunk.chunk_data.type,
        };
      }

      await invokeLambda(
        FusionLambda.SessionInt,
        {
          fusionSlug: nextChunk.target_fusion,
          popupVariables: {
            popup_variables: popupVariables,
          },
          userId: nextChunk.user_id,
          fusion,
          accountId: nextChunk.account_id,
          importChunk: nextChunk,
        },
        InvocationType.Event,
        { roundRobin: true }
      );
    }
  }

  return;
};
export const handler = middy().handler(lambdaHandler);
