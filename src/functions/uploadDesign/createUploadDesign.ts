import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import { S3 } from "aws-sdk";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createError from "http-errors";
import { v4 } from "uuid";
import {
  ACCOUNT_UPLOAD_DESIGN_TABLE_NAME,
  MEDIA_BUCKET_NAME,
  REGION,
  envTableNames,
} from "../../config";
import { dynamodb } from "../../helpers/db";
import type { ValidatedEventAPIGatewayProxyEvent } from "../../lib/apiGateway";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { AccountUser } from "../../types";
import { createFusion } from "../../util/fusion";
import { addItemToFolder } from "../../util/index";
import { createUniversalEvent } from "../universalEvent/createUniversalEvent";

const s3 = new S3({
  signatureVersion: "v4",
  region: REGION,
});

const BUCKET_NAME = `${MEDIA_BUCKET_NAME}`;

const tableName = envTableNames.DYNAMODB_ACCT_UPLOAD_DESIGN;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        title: {
          type: "string",
        },
        type: {
          type: "string",
        },
        sample_file: {
          type: "object",
        },
      },
      required: ["title", "type"],
    },
  },
  required: ["body"],
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { title, type, sample_file } = event.body;
  const user = event.user as AccountUser;
  const accountId: string = event.headers["account-id"] as string;

  try {
    const uploadDesignSlug = v4();
    const uploadDesignId = `${accountId}:${ACCOUNT_UPLOAD_DESIGN_TABLE_NAME}`;

    const fusion = await createDesignFusion(
      uploadDesignSlug,
      title,
      accountId,
      type,
      sample_file as { url: string }
    );

    const uploadDesignParams: DynamoDB.DocumentClient.PutItemInput = {
      TableName: tableName,
      Item: {
        id: uploadDesignId,
        slug: uploadDesignSlug,
        title,
        type,
        sample_file,
        fusion_slug: fusion.fusion_slug,
        created_at: new Date().toISOString(),
        updated_at: null,
        is_active: 1,
        is_deleted: 0,
      },
    };
    await dynamodb.put(uploadDesignParams);

    const folderResourceName = "upload-design";
    await addItemToFolder(
      accountId,
      folderResourceName,
      "Upload Designs",
      uploadDesignSlug,
      uploadDesignId
    );

    await createUniversalEvent({
      recordId: uploadDesignSlug,
      recordType: "upload_design",
      accountId: accountId,
      eventSlug: "created",
      eventData: uploadDesignParams.Item,
      userId: user.slug,
    });

    return {
      statusCode: 201,
      body: { data: uploadDesignParams.Item },
    };
  } catch (error) {
    const err = error as Error;
    throw createError(500, err, { expose: true });
  }
};

const createDesignFusion = async (
  designSlug: string,
  designTitle: string,
  accountId: string,
  importType: string,
  sampleFile?: { url: string }
) => {
  let recordKeys: string[] = [];
  if (importType === "csv" && sampleFile?.url) {
    const s3FilePath = new URL(sampleFile.url).pathname;
    console.log(
      "🚀 ~ file: createUploadDesign.ts:125 ~ s3FilePath:",
      s3FilePath,
      s3FilePath.slice(1)
    );

    const csvFile = await s3
      .getObject({
        Bucket: BUCKET_NAME,
        Key: decodeURIComponent(s3FilePath.slice(1)),
      })
      .promise();

    const [header] = csvFile.Body?.toString().split("\n") || [];

    recordKeys = header.split(",").map((s) => s.trim());
  }

  const slug = `0:${designSlug}:${v4()}`;

  const fusion = await createFusion(accountId, {
    fusion_slug: slug,
    slug,
    fusion_title: designTitle,
    fusion_description: "Fusion for " + designTitle,
    fusion_type: "import",
    fusion_operators: [],
    flow: {
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
    },
    meta_data: {
      import_type: importType,
      upload_design_slug: designSlug,
      record_keys: recordKeys,
    },
  });

  return fusion;
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
  .use(getUser())
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
  .handler(lambdaHandler); // handles common http errors and returns proper responses
