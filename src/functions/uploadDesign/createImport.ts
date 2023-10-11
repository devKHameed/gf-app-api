import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import { S3 } from "aws-sdk";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { parse } from "csv-parse/sync";
import createError from "http-errors";
import { v4 } from "uuid";
import {
  ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
  MEDIA_BUCKET_NAME,
  REGION,
  envTableNames,
} from "../../config";
import { DEFAULT_FUSION_CONCURRENCY_LIMIT } from "../../constants/fusion";
import { dynamodb } from "../../helpers/db";
import type { ValidatedEventAPIGatewayProxyEvent } from "../../lib/apiGateway";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { Account, AccountUser } from "../../types";
import buildUpdateExpression from "../../util/buildUpdateExpression";
import { getUploadDesign } from "../../util/index";

const s3 = new S3({
  signatureVersion: "v4",
  region: REGION,
});

const BUCKET_NAME = `${MEDIA_BUCKET_NAME}`;

const tableName = envTableNames.DYNAMODB_ACCT_IMPORTER_UPLOADS;
const importFusionQueueTable = `${envTableNames.DYNAMODB_ACCT_FUSIONS_QUEUE}`;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              filename: {
                type: "string",
              },
              file_url: {
                type: "string",
              },
              type: {
                type: "string",
              },
            },
            required: ["filename", "file_url", "type"],
          },
        },
      },
      required: ["files"],
    },
  },
  required: ["body"],
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { files } = event.body;
  const accountId: string = event.headers["account-id"] as string;
  const uploadDesignSlug = event.pathParameters?.slug as string;
  const user = event.user as AccountUser;
  const account = event.account as Account;

  if (!uploadDesignSlug) {
    throw createError(400, "Missing Upload Design Slug");
  }

  const importSlug = `${accountId}:${uploadDesignSlug}:${v4()}`;

  try {
    const uploadDesignParams: DynamoDB.DocumentClient.PutItemInput = {
      TableName: tableName,
      Item: {
        id: ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
        slug: importSlug,
        files,
        records_count: 0,
        processed_records: 0,
        uploaded_by: {
          slug: user.slug,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          image: user.image?.url,
        },
        upload_design_slug: uploadDesignSlug,
        status: "Preparing",
        created_at: new Date().toISOString(),
        updated_at: null,
      },
    };

    await dynamodb.put(uploadDesignParams);

    const uploadDesign = await getUploadDesign(accountId, uploadDesignSlug);

    const fusionSettings = account?.fusion_settings;

    const chunkSize =
      fusionSettings?.concurrency_limit ?? DEFAULT_FUSION_CONCURRENCY_LIMIT;

    let allRecordsCount = 0;
    if (uploadDesign?.type === "csv") {
      for (const [idx, { file_url }] of files.entries()) {
        const s3FilePath = new URL(file_url).pathname;

        const csvFile = await s3
          .getObject({
            Bucket: BUCKET_NAME,
            Key: decodeURIComponent(s3FilePath.slice(1)),
          })
          .promise();

        const csvStr = csvFile.Body?.toString();
        const records: Record<string, string>[] = parse(csvStr || "", {
          columns: true,
          skip_empty_lines: true,
        });

        // const [headerString, ...allRecords] =
        //   csvFile.Body?.toString().split("\n") || [];

        // const records = allRecords
        //   .filter((r) => !isEmpty(r))
        //   .filter((r) => Object.values(r).some((v) => v.trim() !== ""));
        const recordsCount = records.length;
        allRecordsCount += recordsCount;
        const headerKeys = Object.keys(records[0] || {});

        if (idx === 0) {
          const pathChunks = s3FilePath.split("/").filter(Boolean);
          const errorFilePath = [
            ...pathChunks,
            "unprocessed-data",
            uploadDesign.slug,
          ].join("/");

          await s3
            .putObject({
              Bucket: BUCKET_NAME,
              Key: errorFilePath,
              Body: `${headerKeys.join(",")}\n`,
              ContentType: "text/csv",
            })
            .promise();
        }

        for (let index = 0; index < records.length; index += chunkSize) {
          const slug = `${accountId}:${importSlug}:${Date.now()}:${v4()}`;
          let indexes = [index, index + chunkSize - 1];
          if (index + chunkSize >= recordsCount) {
            indexes = [index, recordsCount - 1];
          }
          const recordsChunk = records.slice(indexes[0], indexes[1] + 1);
          // const chunkData = recordsChunk.map((record) => {
          //   const values = record;
          //   return headerKeys.reduce<Record<string, string>>(
          //     (acc, key, index) => {
          //       acc[key] = values[index];
          //       return acc;
          //     },
          //     {}
          //   );
          // });
          await dynamodb.put({
            TableName: importFusionQueueTable,
            Item: {
              id: "import-chunk",
              slug,
              parent_slug: importSlug,
              upload_design_slug: uploadDesign.slug,
              user_id: user.slug,
              type: "csv",
              chunk_status: "Pending",
              chunk_indexes: indexes,
              chunk_data: recordsChunk,
              parent_data_url: file_url,
              target_fusion: uploadDesign.fusion_slug,
              account_id: accountId,
              processed_records: 0,
              is_deleted: false,
              created_at: new Date().toISOString(),
              updated_at: null,
            },
          });
        }
      }

      await dynamodb.update(
        buildUpdateExpression({
          keys: {
            id: ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
            slug: importSlug,
          },
          tableName,
          item: {
            records_count: allRecordsCount,
            processed_records: 0,
          },
        })
      );
    } else if (uploadDesign?.type) {
      for (const { file_url, filename, type } of files) {
        const slug = `${accountId}:${importSlug}:${Date.now()}:${v4()}`;
        await dynamodb.put({
          TableName: importFusionQueueTable,
          Item: {
            id: "import-chunk",
            slug,
            parent_slug: importSlug,
            upload_design_slug: uploadDesign.slug,
            user_id: user.slug,
            type: uploadDesign.type,
            chunk_status: "Pending",
            chunk_indexes: [],
            parent_data_url: file_url,
            chunk_data: { file_url, filename, type },
            target_fusion: uploadDesign.fusion_slug,
            account_id: accountId,
            processed_records: 0,
            is_deleted: false,
            created_at: new Date().toISOString(),
            updated_at: null,
          },
        });
      }
      await dynamodb.update(
        buildUpdateExpression({
          keys: {
            id: ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
            slug: importSlug,
          },
          tableName,
          item: {
            records_count: files.length,
            processed_records: 0,
          },
        })
      );
    }

    const { Attributes: updatedImportItem } = await dynamodb.update(
      buildUpdateExpression({
        tableName: tableName,
        keys: {
          id: ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
          slug: importSlug,
        },
        item: {
          status: "Pending",
        },
        ReturnValues: "ALL_NEW",
      })
    );

    return {
      statusCode: 201,
      body: { data: updatedImportItem },
    };
  } catch (error) {
    const err = error as Error;
    throw createError(500, err, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser())
  .use(validator({ eventSchema }))
  .use(getUser())
  .use(getAccountData())
  .use(jsonschemaErrors())
  .use(httpErrorHandler())
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
