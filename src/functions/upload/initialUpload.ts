/* eslint-disable @typescript-eslint/require-await */
import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import { S3 } from "aws-sdk";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { MEDIA_BUCKET_NAME, REGION } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const BUCKET_NAME = MEDIA_BUCKET_NAME;

const s3 = new S3({
  signatureVersion: "v4",
  region: REGION,
});

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        content_type: {
          type: "string",
        },
        folder_name: { type: "string", default: "uploads" },
        content_path: {
          type: "string",
        },
        content_disposition: {
          type: "string",
        },
      },
      required: ["content_type", "content_path"],
    },
  },
  required: ["body"],
} as const;

export const InitialUploadRequest = {
  title: "InitialUploadRequest",
  InitialUploadRequest: eventSchema.properties.body,
};
const signedUrlExpireSeconds = 60 * 5;
const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { content_type, content_path, folder_name, content_disposition } =
    event.body;
  const account_id: string =
    (event.headers["account-id"] as string) || "global";

  const req: S3.Types.PutObjectRequest = {
    Bucket: BUCKET_NAME!,
    Key: `${account_id}/${folder_name}/${content_path}`,
    ContentType: content_type,
    // CacheControl: "max-age=31557600", // instructs CloudFront to cache for 1 year
    // Set Metadata fields to be retrieved post-upload and stored in DynamoDB
    Metadata: {
      account_id,
      // event_id: event.id as string,
    },
    ContentDisposition: content_disposition,
  };

  try {
    // Get the signed URL from S3 and return to client

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const s3PutObjectUrl = s3.getSignedUrl("putObject", req);
    const result = {
      content_path,
      content_type,
      url: s3PutObjectUrl,
    };
    return {
      statusCode: 201,
      body: { data: result },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy(lambdaHandler, { timeoutEarlyInMillis: 0 })
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
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
  ); // handles common http errors and returns proper responses
