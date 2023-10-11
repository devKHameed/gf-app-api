import middy from "@middy/core";
import type { EventBridgeHandler } from "aws-lambda";
import { S3 } from "aws-sdk";
import { MEDIA_BUCKET_NAME, REGION } from "../../config";

const s3 = new S3({
  region: REGION,
});

export type FusionOperatorLogEvent = {
  accountId: string;
  sessionSlug: string;
  operatorSlug: string;
  operationIdx: number;
  data: unknown;
};

export const lambdaHandler: EventBridgeHandler<
  "OperatorLog",
  FusionOperatorLogEvent,
  void
> = async (event) => {
  console.log(
    "🚀 ~ file: generateFusionOperatorLogs.ts:23 ~ >= ~ event:",
    JSON.stringify(event, null, 2)
  );
  const { accountId, sessionSlug, operatorSlug, operationIdx, data } =
    event.detail;
  const logsS3Path = `${accountId}/fusion-sessions/${sessionSlug}/${operatorSlug}/${operationIdx}.logs.json`;

  const buffer = Buffer.from(JSON.stringify(data));

  await s3
    .putObject({
      Bucket: MEDIA_BUCKET_NAME!,
      Key: logsS3Path,
      ContentType: "application/json",
      ContentEncoding: "base64",
      Body: buffer,
    })
    .promise()
    .catch((err) => {
      console.error(err);
    });
};
export const handler = middy().handler(lambdaHandler);
