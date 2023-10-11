import { TranscribeService } from "aws-sdk";
import { getTranscriberClient } from ".";
import { MEDIA_BUCKET_NAME } from "../../config";

type CreateTranscriptionJobParams = {
  jobName: string;
  languageCode: string;
  fileUrl: string;
  settings?: TranscribeService.Settings;
  accountId: string;
};

export const createTranscriptionJob = async (
  data: CreateTranscriptionJobParams
) => {
  console.log("🚀 ~ file: job.ts:17 ~ data:", data);
  const transcriber = await getTranscriberClient();

  const jobName = `${data.jobName}`;

  console.log("🚀 ~ file: job.ts:22 ~ jobName:", jobName);
  const params: TranscribeService.StartTranscriptionJobRequest = {
    TranscriptionJobName: jobName,
    LanguageCode: data.languageCode,
    Media: {
      MediaFileUri: data.fileUrl,
    },
    OutputBucketName: MEDIA_BUCKET_NAME,
    OutputKey: `${data.accountId}/transcription-job-outputs/${jobName}.json`,
    Settings: data.settings,
  };
  console.log("🚀 ~ file: job.ts:33 ~ params:", params);

  return await transcriber.startTranscriptionJob(params).promise();
};

type ListTranscriptionJobParams =
  TranscribeService.ListTranscriptionJobsRequest;

export const listTranscriptionJob = async (
  params: ListTranscriptionJobParams
) => {
  const transcriber = await getTranscriberClient();

  return await transcriber.listTranscriptionJobs(params).promise();
};

export const getTranscriptionJob = async (jobName: string) => {
  const transcriber = await getTranscriberClient();

  return await transcriber
    .getTranscriptionJob({ TranscriptionJobName: `${jobName}` })
    .promise();
};

export const deleteTranscriptionJob = async (jobName: string) => {
  const transcriber = await getTranscriberClient();

  return await transcriber
    .deleteTranscriptionJob({ TranscriptionJobName: jobName })
    .promise();
};
