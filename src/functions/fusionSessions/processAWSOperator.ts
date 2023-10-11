import middy from "@middy/core";
import archiver, { ArchiverError } from "archiver";
import { Handler } from "aws-lambda";
import * as AWS from "aws-sdk";
import axios from "axios";
import https from "https";
import * as lazystream from "lazystream";
import { get, isArray, isBuffer } from "lodash";
import isString from "lodash/isString";
import moment from "moment";
import { Readable, Stream } from "stream";
import { v4 } from "uuid";
import {
  ACCOUNT_DATASET_DESIGN_TABLE_NAME,
  ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
  MEDIA_BUCKET_NAME,
  S3_URL,
  envTableNames,
} from "../../config";
import { AWSOperators } from "../../constants/3pApp";
import { ModuleType } from "../../enums/3pApp";
import {
  ParseOptions,
  getFunctions,
  parseExpression,
} from "../../helpers/3pExpression";
import { parseTagsToExpression } from "../../helpers/3pExpression/tagsParser";
import { dynamodb } from "../../helpers/db";
import { getAuroraConnection } from "../../helpers/db/aurora";
import {
  addOperatorOperations,
  finalizeOperator,
  getPrevOperatorResponses,
  getS3Client,
  getYTCombS3Client,
} from "../../helpers/fusion";
import { removeQueueItem } from "../../helpers/fusion/executionQueue";
import {
  createTranscriptionJob,
  deleteTranscriptionJob,
  getTranscriptionJob,
  listTranscriptionJob,
} from "../../helpers/tanscription/job";
import { splitAudioFile } from "../../helpers/transcoder/splitAudioFile";
import mainDbInitializer from "../../middleware/mainDbInitializer";
import { DatasetDesign } from "../../types";
import { Dataset } from "../../types/Dataset";
import {
  FusionLambdaEvent,
  FusionOperatorLog,
  ProcessOperatorParams,
} from "../../types/Fusion";
import {
  generateLog,
  getSessionItem,
  sendFusionNotification,
  updateOperatorLogs,
  updateSession,
  updateSessionOperatorStatus,
  updateSessionStatus,
} from "../../util/3pModule";
import getAccount from "../../util/getAccount";
import { applyToValues, isValidUrl } from "../../util/index";

export const processAWSOperatorHandler: Handler<FusionLambdaEvent> = async (
  event,
  ...args
) => {
  console.time("process-basic-system-operator-time");
  console.log(
    "process basic system operators lambda hit: ",
    JSON.stringify(event, null, 2),
    JSON.stringify(args, null, 2)
  );

  const operatorLogs: FusionOperatorLog[] = [];

  try {
    await processAWSOperator({ ...event, operatorLogs });
  } catch (err) {
    console.log(
      "🚀 ~ file: processAWSOperator.ts:64 ~ constlambdaHandler:Handler<FusionLambdaEvent>= ~ err:",
      err
    );
    const session = await getSessionItem(event.sessionSlug, event.accountId);
    await updateSession(
      event.accountId,
      event.sessionSlug,
      "SET session_data.error_logs = list_append(session_data.error_logs, :log), session_data.session_status = :sessionStatus, session_data.finish_time = :finishTime",
      {
        ":log": [
          {
            message: (err as Error).message,
            stack: (err as Error).stack,
            event,
          },
          ...operatorLogs,
        ],
        ":sessionStatus": "Failed",
        ":finishTime": moment.utc().format(),
      }
    );
    if (session.session_data.import_chunk?.parent_slug) {
      await dynamodb.update({
        TableName: envTableNames.DYNAMODB_ACCT_FUSIONS_QUEUE,
        Key: {
          id: "import-chunk",
          slug: session.session_data.import_chunk?.slug,
        },
        UpdateExpression: "SET #status = :status",
        ExpressionAttributeNames: {
          "#status": "chunk_status",
        },
        ExpressionAttributeValues: {
          ":status": "Failed",
        },
        ReturnValues: "ALL_NEW",
      });
      const { Attributes } = await dynamodb.update({
        TableName: envTableNames.DYNAMODB_ACCT_IMPORTER_UPLOADS,
        Key: {
          id: ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
          slug: session.session_data.import_chunk?.parent_slug,
        },
        UpdateExpression: "SET #status = :status",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": "Failed",
        },
        ReturnValues: "ALL_NEW",
      });

      await sendFusionNotification({
        ...session,
        is_import_session: true,
        session_data: {
          ...session.session_data,
          payload: Attributes,
        },
      });
    }
  }

  console.timeEnd("process-basic-system-operator-time");
  console.log("Memory: ", process.memoryUsage());
};

type AWSOperatorParams = {
  s3_file_key?: string;
  job_name: string;
  language_code: string;
  file_url: string;
  file_data: unknown;
  settings?: Record<string, any>;
  max_results?: number;
  job_name_contains?: string;
  job_status?: string;
  file_name: string;
  start_time: string;
  end_time: string;
  file_path: string;
  dataset_design_slug?: string;
  job_name_field?: string;
  job_status_field?: string;
  search_operators?: {
    operator_slug: string;
    file_fields: string[];
  }[];
  expires_in: number;
};

export const processAWSOperator = async (event: ProcessOperatorParams) => {
  const {
    sessionSlug,
    appSlug,
    accountId,
    queueItem,
    appModuleSlug,
    responses: s3Responses,
    operatorLogs = [],
  } = event;

  //Get The Session Data
  // console.log("Get Session Data");
  const session = await getSessionItem(sessionSlug, accountId);
  const { session_data: sessionData } = session || {};

  const { session_operators, session_variables = {} } = sessionData || {};

  const operatorIdx = session_operators.findIndex(
    (operator) => operator.operator_slug === queueItem.operator_id
  );
  const operator = session_operators[operatorIdx];

  operatorLogs.push(
    generateLog("Operator initiated", "Success", {
      sessionSlug,
      operatorSlug: queueItem.operator_id,
      appSlug,
      appModuleSlug,
    })
  );

  if (!operator) {
    return;
  }

  // Consume Credit
  // console.log("Consume Credit");
  // await consumeCredits(accountId, operator.total_credit);

  //SET STATUS AS PROCESSING
  // console.log("Set Status as Processing");
  await updateSessionOperatorStatus(
    sessionSlug,
    "Processing",
    operatorIdx,
    accountId
  );

  const operationIdx = await addOperatorOperations(
    accountId,
    sessionSlug,
    operator.operator_slug!
  );

  const extraResponses = [];
  if (isString(queueItem.inputs.source)) {
    extraResponses.push(queueItem.inputs.source);
  }

  const searchOperators = queueItem.inputs
    .search_operators as AWSOperatorParams["search_operators"];
  if (searchOperators?.length) {
    extraResponses.push(
      ...searchOperators.map((operator) => operator.operator_slug)
    );
  }

  const responses = await getPrevOperatorResponses(
    queueItem.inputs,
    s3Responses,
    extraResponses
  );

  const gfmlFunctions = await getFunctions(appSlug, accountId);

  const options: ParseOptions = {
    body: {},
    responses: { ...responses, session_variables },
    functions: gfmlFunctions,
  };

  const inputExpressions = applyToValues(
    queueItem.inputs,
    parseTagsToExpression
  );

  const parameters = await parseExpression<AWSOperatorParams>(
    inputExpressions,
    options
  );

  operatorLogs.push(
    generateLog(`Operation ${(operationIdx || 0) + 1} Started`, "Success")
  );

  let response: any = {};
  let moduleType: string = ModuleType.Action;
  switch (operator.app_module) {
    case AWSOperators.ZipS3FilesFromDatasets: {
      if (!searchOperators?.length) {
        break;
      }

      const { expires_in } = parameters;

      type FileData = { url: string; name: string };
      type S3FileData = { path: string; name: string };

      const s3FilesData = searchOperators.reduce<S3FileData[]>((acc, cur) => {
        const operatorResponse = responses[cur.operator_slug] as
          | { data?: Record<string, unknown>[] }
          | undefined;
        const records = operatorResponse?.data ?? [];

        const filesData = records.reduce<S3FileData[]>((acc, record) => {
          acc.push(
            ...cur.file_fields.reduce<S3FileData[]>((fileDataArray, field) => {
              const fileData = record?.[field] as
                | FileData
                | FileData[]
                | undefined;
              if (!fileData) {
                return fileDataArray;
              }

              if (isArray(fileData)) {
                fileDataArray.push(
                  ...fileData.map((file) => ({
                    name: `${v4()}-${file.name ?? file.url.split("/").pop()}`,
                    path: new URL(file.url).pathname.slice(1),
                  }))
                );

                return fileDataArray;
              }
              const { name, url } = fileData;

              if (!url) {
                return fileDataArray;
              }

              fileDataArray.push({
                name: `${v4()}-${name ?? url.split("/").pop()}`,
                path: new URL(url).pathname.slice(1),
              });

              return fileDataArray;
            }, [])
          );

          return acc;
        }, []);

        acc.push(...filesData);

        return acc;
      }, []);

      const s3 = await getS3Client();
      const zipPath = `${accountId}/fusion-sessions/${sessionSlug}/${operator.operator_slug}/${operationIdx}.zip`;

      const agent = new https.Agent({ keepAlive: true, maxSockets: 16 });

      AWS.config.update({ httpOptions: { agent } });

      type S3DownloadStreamDetails = { stream: any; filename: string };

      const s3DownloadStreams: S3DownloadStreamDetails[] = s3FilesData.map(
        (file) => {
          return {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            stream: new lazystream.Readable(() => {
              console.log(`Creating read stream for ${file.path}`);
              return s3
                .getObject({ Bucket: MEDIA_BUCKET_NAME!, Key: file.path })
                .createReadStream();
            }),
            filename: file.name,
          };
        }
      );

      const streamPassThrough = new Stream.PassThrough();
      const params: AWS.S3.PutObjectRequest = {
        Bucket: MEDIA_BUCKET_NAME!,
        ContentType: "application/zip",
        Key: zipPath,
        Body: streamPassThrough,
      };

      const s3Upload = s3.upload(params, (error: Error): void => {
        if (error) {
          console.error("Got error creating stream to s3");
          console.log(error);
          throw error;
        }
      });

      const archive = archiver("zip");
      archive.on("error", (error: ArchiverError) => {
        throw error;
      });

      await new Promise<void>((resolve, reject) => {
        console.log("Starting upload");

        archive.pipe(streamPassThrough);
        s3DownloadStreams.forEach((streamDetails: S3DownloadStreamDetails) =>
          archive.append(streamDetails.stream as Readable, {
            name: streamDetails.filename,
          })
        );
        void archive
          .finalize()
          .then(() => {
            console.log("Finished ZIP upload");
            resolve();
          })
          .catch((error) => {
            reject(error);
          });
      }).catch((error) => {
        console.log(error);
        throw error;
      });

      await s3Upload.promise();

      const publicUrl = s3.getSignedUrl("getObject", {
        Bucket: process.env.MEDIA_BUCKET_NAME,
        Key: zipPath,
        Expires: Number(expires_in) ?? 3600,
      });

      response = {
        private_url: `${S3_URL}/${zipPath}`,
        public_url: publicUrl,
      };

      break;
    }
    case AWSOperators.GetTemporaryS3Link: {
      const { s3_file_key } = parameters;
      console.log("get temporary s3 link");
      if (!s3_file_key) {
        throw new Error("s3 file key is required");
      }

      const s3Client = await getS3Client();
      const url = s3Client.getSignedUrl("getObject", {
        Bucket: MEDIA_BUCKET_NAME,
        Key: s3_file_key,
        Expires: 3600,
      });

      response = { url };
      operatorLogs.push(
        generateLog("Get S3 Temporary Link", "Success", response)
      );
      break;
    }
    case AWSOperators.TranscriptionJobTrigger: {
      const { dataset_design_slug, job_name_field, job_status_field } =
        parameters;

      const account = await getAccount(accountId);
      const { Item } = await dynamodb.get({
        TableName: envTableNames.DYNAMODB_ACCT_DATASET_DESIGN,
        Key: {
          id: `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`,
          slug: `${dataset_design_slug}`,
        },
      });

      const design = Item as DatasetDesign;
      if (
        !dataset_design_slug ||
        !job_name_field ||
        !job_status_field ||
        !account?.database_name ||
        !design
      ) {
        await updateOperatorLogs(
          sessionSlug,
          operatorIdx,
          "Complete",
          operatorLogs,
          accountId
        );

        await updateSessionStatus(sessionSlug, "Complete", accountId, {});
        await removeQueueItem(sessionSlug, queueItem.slug);
        return;
      }

      const connection = await getAuroraConnection(account?.database_name);

      const query = `SELECT * FROM \`${design.sql_table_name}\` WHERE \`${job_status_field}\`->'$[0]' = 'QUEUED' OR \`${job_status_field}\`->'$[0]' = 'IN_PROGRESS';`;

      const [res] = await connection.execute(query);

      const datasets = res as Dataset[];

      if (!datasets.length) {
        console.log("No Pending Datasets");
        await updateOperatorLogs(
          sessionSlug,
          operatorIdx,
          "Complete",
          operatorLogs,
          accountId
        );

        await updateSessionStatus(sessionSlug, "Complete", accountId, {});
        await removeQueueItem(sessionSlug, queueItem.slug);
        return;
      }

      const jobResponses: unknown[] = [];

      for (const dataset of datasets) {
        const { TranscriptionJob } = await getTranscriptionJob(
          get(dataset, job_name_field) as string
        );

        if (TranscriptionJob?.TranscriptionJobStatus === "COMPLETED") {
          const jobName = get(dataset, job_name_field);
          const updateQuery = `UPDATE \`${design.sql_table_name}\` SET \`${job_status_field}\` = '["COMPLETED"]' WHERE \`${job_name_field}\` = '${jobName}';`;

          await connection.execute(updateQuery);

          const outputS3Link = new URL(
            TranscriptionJob.Transcript?.TranscriptFileUri || ""
          ).pathname.slice(1);

          if (!outputS3Link) {
            continue;
          }

          try {
            const s3 = await getS3Client();
            const s3Data = await s3
              .getObject({
                Bucket: outputS3Link.split("/")[0],
                Key: outputS3Link.slice(outputS3Link.indexOf("/") + 1),
              })
              .promise();
            const jsonStr = s3Data.Body?.toString("utf-8");

            if (!jsonStr) {
              continue;
            }
            const json = JSON.parse(jsonStr);

            jobResponses.push(json);
          } catch (e) {
            console.log(
              "🚀 ~ file: processAWSOperator.ts:391 ~ processAWSOperator ~ e:",
              e
            );
            continue;
          }
        }
      }

      if (jobResponses.length === 0) {
        await updateOperatorLogs(
          sessionSlug,
          operatorIdx,
          "Complete",
          operatorLogs,
          accountId
        );

        await updateSessionStatus(sessionSlug, "Complete", accountId, {});
        return;
      }

      moduleType = ModuleType.Trigger;
      response = jobResponses;

      break;
    }
    case AWSOperators.CreateTranscriptionJob: {
      const { job_name, file_url, language_code, settings } = parameters;

      let filePath = `https://${MEDIA_BUCKET_NAME}.s3.amazonaws.com/${accountId}/uploads/${operator.operator_slug}`;
      if (isBuffer(file_url)) {
        const s3 = await getS3Client();
        await s3
          .putObject({
            Bucket: MEDIA_BUCKET_NAME!,
            Key: `${accountId}/uploads/${operator.operator_slug}`,
            Body: file_url as unknown as Buffer,
          })
          .promise();
        filePath = `https://${MEDIA_BUCKET_NAME}.s3.amazonaws.com/${accountId}/uploads/${operator.operator_slug}`;
      } else if (isString(file_url)) {
        filePath = file_url;
      }

      const res = await createTranscriptionJob({
        jobName: job_name,
        fileUrl: filePath,
        languageCode: language_code,
        settings: {
          VocabularyName: settings?.vocabulary_name,
          ShowSpeakerLabels: settings?.show_speaker_labels,
          MaxSpeakerLabels: Number(settings?.max_speaker_labels),
          ChannelIdentification: settings?.channel_identification,
          ShowAlternatives: settings?.show_alternatives,
          MaxAlternatives: settings?.max_alternatives,
        },
        accountId,
      });

      response = {
        transcriptionJobName: res.TranscriptionJob?.TranscriptionJobName,
        transcriptionJobStatus: res.TranscriptionJob?.TranscriptionJobStatus,
      };
      break;
    }
    case AWSOperators.ListTranscriptionJobs: {
      const { max_results, job_name_contains, job_status } = parameters;
      const res = await listTranscriptionJob({
        MaxResults: max_results,
        JobNameContains: job_name_contains,
        Status: job_status,
      });

      response = {
        transcription_job_summaries:
          res.TranscriptionJobSummaries?.map((job) => ({
            job_name: job.TranscriptionJobName,
            job_status: job.TranscriptionJobStatus,
            creation_time: job.CreationTime,
            start_time: job.StartTime,
            completion_time: job.CompletionTime,
            language_code: job.LanguageCode,
            output_location_type: job.OutputLocationType,
          })) ?? [],
      };

      break;
    }
    case AWSOperators.GetTranscriptionJob: {
      const { TranscriptionJob } = await getTranscriptionJob(
        parameters.job_name
      );
      response = {
        transcription_jon_name: TranscriptionJob?.TranscriptionJobName,
        transcription_jon_status: TranscriptionJob?.TranscriptionJobStatus,
        language_code: TranscriptionJob?.LanguageCode,
        media_sample_rate_hertz: TranscriptionJob?.MediaSampleRateHertz,
        media_format: TranscriptionJob?.MediaFormat,
        media: {
          media_file_url: TranscriptionJob?.Media?.MediaFileUri,
        },
        transcript: {
          transcript_file_url: TranscriptionJob?.Transcript?.TranscriptFileUri,
        },
        start_time: TranscriptionJob?.StartTime,
        creation_time: TranscriptionJob?.CreationTime,
        completion_time: TranscriptionJob?.CompletionTime,
        settings: {
          channel_identification:
            TranscriptionJob?.Settings?.ChannelIdentification,
          show_alternatives: TranscriptionJob?.Settings?.ShowAlternatives,
        },
      };

      break;
    }
    case AWSOperators.DeleteTranscriptionJob: {
      await deleteTranscriptionJob(parameters.job_name);

      response = {};
      break;
    }
    case AWSOperators.SplitAudio: {
      const { file_data, start_time, end_time } = parameters;

      let filePath;
      if (isString(file_data)) {
        if (isValidUrl(file_data)) {
          if (file_data.startsWith("s3://")) {
            const noProtocolPath = file_data.replace("s3://", "");
            filePath = noProtocolPath.slice(noProtocolPath.indexOf("/") + 1);
          } else {
            filePath = file_data.split(".s3.amazonaws.com/")[1];
          }
        } else {
          filePath = file_data;
        }
      } else {
        const s3 = await getYTCombS3Client();
        await s3
          .putObject({
            Bucket: "formcode",
            Key: `${operator.operator_slug}.mp3`,
            Body: file_data as Buffer,
          })
          .promise();
        filePath = `${operator.operator_slug}.mp3`;
      }
      const res = await splitAudioFile(
        filePath,
        start_time,
        moment
          .utc(
            moment(end_time, "HH:mm:ss").diff(moment(start_time, "HH:mm:ss"))
          )
          .format("HH:mm:ss.SSS")
      );

      response = {
        job_id: res.Job?.Id,
        job_status: res.Job?.Status,
      };
      break;
    }
    case AWSOperators.RunPodExtractFaces: {
      const { file_data } = parameters;
      let filePath = operator.operator_slug!;
      if (isBuffer(file_data)) {
        const s3 = await getYTCombS3Client();
        await s3
          .putObject({
            Bucket: "najeeb-machine-learner",
            Key: operator.operator_slug!,
            Body: file_data as Buffer,
          })
          .promise();
        filePath = operator.operator_slug!;
      } else if (isString(file_data)) {
        if (isValidUrl(file_data)) {
          if (file_data.startsWith("s3://")) {
            const noProtocolPath = file_data.replace("s3://", "");
            filePath = noProtocolPath.slice(noProtocolPath.indexOf("/") + 1);
          } else {
            filePath = file_data.split(".s3.amazonaws.com/")[1];
          }
        } else {
          filePath = file_data;
        }
      }

      const { data } = await axios.post(
        "https://api.runpod.ai/v2/261vem1hfdajn5/run",
        {
          id: v4(),
          input: {
            bucketName: "najeeb-machine-learner",
            key: filePath,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer 5RQOCM87Z7UI7PV5YJDR2UAOO9518FB822O56HVF",
          },
        }
      );

      response = {
        job_id: data.id,
        job_status: data.status,
      };

      break;
    }
    default:
      console.log("Invalid App Module: Skipping");
  }

  await updateOperatorLogs(
    sessionSlug,
    operatorIdx,
    "Complete",
    operatorLogs,
    accountId
  );

  await finalizeOperator({
    accountId,
    sessionSlug,
    operator,
    operationIdx,
    appSlug,
    inputs: parameters,
    outputs: response,
    moduleType: moduleType as ModuleType,
    sessionData,
    queueItem,
    responses: s3Responses,
    operatorLogs,
    prevOperatorResponses: responses,
    operatorIdx,
  });
};

export const handler = middy()
  .use(mainDbInitializer())
  .handler(processAWSOperatorHandler);
