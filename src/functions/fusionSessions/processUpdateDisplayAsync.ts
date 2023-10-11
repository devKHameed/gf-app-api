import middy from "@middy/core";
import { Handler } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import { get } from "lodash";
import moment from "moment";
import { v4 } from "uuid";
import {
  ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
  ACCOUNT_JOB_SESSION_DATA_TABLE_NAME,
  MEDIA_BUCKET_NAME,
  WEBSOCKET_URL,
  envTableNames,
} from "../../config";
import { getUserSocketConnection } from "../../functions/websocket/helper";
import { emit } from "../../functions/websocket/util";
import { dynamodb } from "../../helpers/db";
import { getS3Client } from "../../helpers/fusion";
import mainDbInitializer from "../../middleware/mainDbInitializer";
import { JobSessionData } from "../../types/Job";
import { SylarSession } from "../../types/Sylar";
import {
  getSessionItem,
  sendFusionNotification,
  updateSession,
} from "../../util/3pModule";
import buildUpdateExpression from "../../util/buildUpdateExpression";
import { createFusion as createFusionFunc } from "../../util/fusion";
import { SylarAction, SylarEvent } from "../websocket/sylar";

type HandleUpdateDisplayParams = {
  accountId: string;
  responses: Record<string, unknown>;
  userId: string;
  job_slug?: string;
  html?: string;
  css?: string;
  js?: string;
  display_type: "html" | "code" | "fusion";
  code_action?: "append" | "replace";
  code?: string;
  fusion_slug?: string;
  fusion_type?: "open_fusion" | "create_fusion";
  fusion_editor_action?: string;
};

export const processUpdateDisplayAsyncHandler: Handler<
  HandleUpdateDisplayParams & { sessionSlug: string }
> = async (event) => {
  // console.time("process-basic-system-operator-time");
  // console.log(
  //   "process basic system operators lambda hit: ",
  //   JSON.stringify(event, null, 2)
  // );
  try {
    await processUpdateDisplayAsync(event);
  } catch (err) {
    console.log(
      "🚀 ~ file: processUpdateDisplayAsync.ts:58 ~ constlambdaHandler:Handler<FusionLambdaEvent>= ~ err:",
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

  // console.timeEnd("process-basic-system-operator-time");
  // console.log("Memory: ", process.memoryUsage());
};

const handleHtmlDisplayUpdate = async (params: HandleUpdateDisplayParams) => {
  const {
    accountId,
    responses,
    job_slug,
    userId,
    html,
    css,
    js,
    display_type,
  } = params;
  const s3 = await getS3Client();
  const htmlUrl = `${accountId}/job_session_data/${get(responses, [
    "popup_variables",
    "skill_session_id",
  ])}/${job_slug}.html`;
  const cssUrl = `${accountId}/job_session_data/${get(responses, [
    "popup_variables",
    "skill_session_id",
  ])}/${job_slug}.css`;
  const jsUrl = `${accountId}/job_session_data/${get(responses, [
    "popup_variables",
    "skill_session_id",
  ])}/${job_slug}.js`;
  const sessionData: Record<string, string> = { display_type };
  if (html) {
    await s3
      .putObject({
        Bucket: MEDIA_BUCKET_NAME!,
        Key: htmlUrl,
        Body: html,
      })
      .promise();

    sessionData.html = htmlUrl;
  }

  if (css) {
    await s3
      .putObject({
        Bucket: MEDIA_BUCKET_NAME!,
        Key: cssUrl,
        Body: css,
      })
      .promise();

    sessionData.css = cssUrl;
  }

  if (js) {
    await s3
      .putObject({
        Bucket: MEDIA_BUCKET_NAME!,
        Key: jsUrl,
        Body: js,
      })
      .promise();

    sessionData.js = jsUrl;
  }

  if (job_slug === "general") {
    const chatSessionSlug = get(responses, [
      "popup_variables",
      "chat_session_id",
    ]);

    await dynamodb.update(
      {
        TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_SESSION,
        Key: {
          id: `${accountId}:${userId}`,
          slug: chatSessionSlug,
        },
        UpdateExpression: "SET #metaData.#sessionData = :sessionData",
        ExpressionAttributeNames: {
          "#metaData": "meta_data",
          "#sessionData": "session_data",
        },
        ExpressionAttributeValues: {
          ":sessionData": sessionData,
        },
      },
      2
    );
  } else {
    const params: DynamoDB.DocumentClient.UpdateItemInput =
      buildUpdateExpression({
        keys: {
          id: `${accountId}:${ACCOUNT_JOB_SESSION_DATA_TABLE_NAME}`,
          slug: `${job_slug}`,
        },
        tableName: envTableNames.DYNAMODB_JOB_SESSION_DATA,
        item: {
          session_data: sessionData,
        },
      });

    await dynamodb.update(params, 2);
  }
  const userSocketConnections = await getUserSocketConnection(userId);

  await emit(
    SylarAction.SYLAR_EVENT,
    {
      type: SylarEvent.UPDATE_DISPLAY,
      data: {
        ...sessionData,
        job_slug,
      },
    },
    WEBSOCKET_URL,
    userSocketConnections,
    "sylar"
  ).catch((e) => {
    // handle error here
    console.error(e);
  });
};

const handleCodeDisplayUpdate = async (params: HandleUpdateDisplayParams) => {
  const {
    accountId,
    responses,
    job_slug,
    userId,
    code,
    display_type,
    code_action = "append",
  } = params;

  if (job_slug === "general") {
    const chatSessionSlug = get(responses, [
      "popup_variables",
      "chat_session_id",
    ]);

    const { Item } = await dynamodb.get({
      TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_SESSION,
      Key: {
        id: `${accountId}:${userId}`,
        slug: chatSessionSlug,
      },
    });

    const chatSession = Item as SylarSession;

    if (!chatSession) {
      throw new Error(`No chat session found for: ${chatSessionSlug}`);
    }

    const oldCode = (chatSession.meta_data?.session_data?.code || "") as string;
    const updatedCode = code_action === "append" ? `${oldCode}${code}` : code;

    const sessionData = {
      ...(chatSession.meta_data?.session_data || {}),
      display_type,
      code_action,
      code: updatedCode,
    };

    await dynamodb.update(
      {
        TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_SESSION,
        Key: {
          id: `${accountId}:${userId}`,
          slug: chatSessionSlug,
        },
        UpdateExpression: "SET #metaData.#sessionData = :sessionData",
        ExpressionAttributeNames: {
          "#metaData": "meta_data",
          "#sessionData": "session_data",
        },
        ExpressionAttributeValues: {
          ":sessionData": sessionData,
        },
      },
      2
    );
  } else {
    const { Item } = await dynamodb.get({
      TableName: envTableNames.DYNAMODB_JOB_SESSION_DATA,
      Key: {
        id: `${accountId}:${ACCOUNT_JOB_SESSION_DATA_TABLE_NAME}`,
        slug: `${job_slug}`,
      },
    });

    const jobSessionData = Item as JobSessionData;

    const oldCode = (jobSessionData.session_data.code || "") as string;
    const updatedCode = code_action === "append" ? `${oldCode}${code}` : code;
    const sessionData = {
      ...(jobSessionData.session_data || {}),
      display_type,
      code_action,
      code: updatedCode,
    };

    const params: DynamoDB.DocumentClient.UpdateItemInput =
      buildUpdateExpression({
        keys: {
          id: `${accountId}:${ACCOUNT_JOB_SESSION_DATA_TABLE_NAME}`,
          slug: `${job_slug}`,
        },
        tableName: envTableNames.DYNAMODB_JOB_SESSION_DATA,
        item: {
          session_data: sessionData,
        },
      });

    await dynamodb.update(params, 2);
  }
  const userSocketConnections = await getUserSocketConnection(userId);

  await emit(
    SylarAction.SYLAR_EVENT,
    {
      type: SylarEvent.UPDATE_DISPLAY,
      data: {
        display_type,
        code_action,
        code,
        job_slug,
        id: v4(),
      },
    },
    WEBSOCKET_URL,
    userSocketConnections,
    "sylar"
  ).catch((e) => {
    // handle error here
    console.error(e);
  });
};

const handleFusionDisplayUpdate = async (params: HandleUpdateDisplayParams) => {
  const userSocketConnections = await getUserSocketConnection(params.userId);

  if (params.fusion_type === "open_fusion") {
    await emit(
      SylarAction.SYLAR_EVENT,
      {
        type: SylarEvent.UPDATE_DISPLAY,
        data: {
          display_type: params.display_type,
          fusion_slug: params.fusion_slug,
          job_slug: params.job_slug,
          fusion_type: params.fusion_type,
          id: v4(),
        },
      },
      WEBSOCKET_URL,
      userSocketConnections,
      "sylar"
    ).catch((e) => {
      // handle error here
      console.error(e);
    });
  } else if (
    params.fusion_type === "create_fusion" &&
    params.fusion_editor_action
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const createFusion = (fusionName: string, fusionType: string) => {
      return async (accountId: string) => {
        const fusion = await createFusionFunc(accountId, {
          fusion_title: fusionName,
          fusion_description: "",
          fusion_type: fusionType,
          fusion_operators: [],
          flow: {
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [],
            edges: [],
          },
        });

        return fusion;
      };
    };
    const code = `
        (async function() {
            const result = await ${params.fusion_editor_action}("${params.accountId}");
            return result;
        })()
    `;
    const output = await eval(code);
    console.log(
      "🚀 ~ file: processUpdateDisplayAsync.ts:415 ~ handleFusionDisplayUpdate ~ output:",
      output
    );

    return output as unknown;
  }
};

export const processUpdateDisplayAsync = async (
  params: HandleUpdateDisplayParams
) => {
  const { display_type } = params;

  if (display_type === "html") {
    return await handleHtmlDisplayUpdate(params);
  } else if (display_type === "code") {
    return await handleCodeDisplayUpdate(params);
  } else if (display_type === "fusion") {
    return await handleFusionDisplayUpdate(params);
  }
};

export const handler = middy()
  .use(mainDbInitializer())
  .handler(processUpdateDisplayAsyncHandler);
