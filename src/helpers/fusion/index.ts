/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable indent */
import { PutEventsRequestEntry } from "aws-sdk/clients/eventbridge";
import S3 from "aws-sdk/clients/s3";
import STS from "aws-sdk/clients/sts";
import { isNumber } from "lodash";
import cloneDeep from "lodash/cloneDeep";
import has from "lodash/has";
import isArray from "lodash/isArray";
import isEmpty from "lodash/isEmpty";
import isPlainObject from "lodash/isPlainObject";
import isString from "lodash/isString";
import set from "lodash/set";
import { v4 } from "uuid";
import {
  ACCT_NAME,
  envTableNames,
  FUSION_EVENT_BUS_NAME_PREFIX,
  MAIN_ACCT_ACCESS_ROLE_ARN,
  MAIN_ACCT_ACCESS_ROLE_SESSION_NAME,
  MEDIA_BUCKET_NAME,
  REGION,
  S3_URL,
  YTCOMB_ACCT_ACCESS_ROLE_ARN,
  YTCOMB_ACCT_ACCESS_ROLE_SESSION_NAME,
} from "../../config";
import { AuthTypes } from "../../constants/3pApp";
import { ModuleType } from "../../enums/3pApp";
import { FusionType } from "../../enums/fusion";
import { dynamodb } from "../../helpers/db";
import { performCreditCheck } from "../../helpers/fusion/fusionCredit";
import {
  FusionConnection,
  FusionOperatorLog,
  FusionWebhook,
  GFMLFunction,
  SessionData,
  SessionOperator,
  ThreePAppConnection,
  ThreePAppWebhook,
} from "../../types";
import {
  generateLog,
  getSessionItem,
  putOperatorLogs,
  updateAccessToken,
  updateSession,
} from "../../util/3pModule";
import { hasTags, sleep } from "../../util/index";
import { getIfTag } from "../3pExpression/tagsParser";
import completeFusionSession from "./completeFusionSession";
import processOperator from "./executeOperator";
import {
  getNextQueueItem,
  insertQueueItems,
  QueueItem,
  removeQueueItem,
} from "./executionQueue";

const stsClient = new STS();

type FinalizeOperatorData = {
  accountId: string;
  sessionSlug: string;
  operator: SessionOperator;
  operationIdx: number;
  appSlug: string;
  inputs: unknown;
  outputs: unknown;
  moduleType:
    | ModuleType
    | "array_iterator"
    | "basic_trigger"
    | "repeater"
    | "loop"
    | "loop_while";
  sessionData: Partial<SessionData> & {
    session_operators: SessionData["session_operators"];
  };
  queueItem: QueueItem;
  responses: Record<string, { responseUrl: string; index?: number }>;
  operatorLogs?: FusionOperatorLog[];
  prevOperatorResponses?: Record<string, unknown>;
  skipNext?: boolean;
  operatorIdx: number;
};

export const finalizeOperator = async (data: FinalizeOperatorData) => {
  const {
    accountId,
    sessionSlug,
    operator,
    operationIdx,
    inputs: parameters,
    outputs: lastResponse,
    moduleType,
    sessionData,
    queueItem,
    responses,
    operatorLogs = [],
    prevOperatorResponses = {},
    skipNext,
    operatorIdx,
  } = data;

  const parallelExecution = sessionData.parallel_branch_execution;

  const s3Path = await updateOperatorOperations(
    accountId,
    sessionSlug,
    operator.operator_slug!,
    operationIdx,
    {
      status: "Complete",
      inputs: parameters,
      outputs: lastResponse,
      logs: operatorLogs,
    }
  );
  // console.log("🚀 ~ file: index.ts:104 ~ finalizeOperator ~ s3Path:", s3Path);

  let childOperators = sessionData?.session_operators?.filter(
    (op) => op.parent_operator_slug === operator.operator_slug
  );

  if (operator.in_loop && childOperators.length === 0) {
    const loopEndOperator = sessionData?.session_operators?.find(
      (op) => op.operator_slug === operator.loop_data?.loop_end_slug
    );
    if (loopEndOperator) {
      childOperators = [loopEndOperator];
    }
  }

  await removeQueueItem(sessionSlug, queueItem.slug);

  if (skipNext || !childOperators.length) {
    if (operator.in_loop) {
      const loopEndOperator = sessionData?.session_operators.find(
        (op) => op.operator_slug === operator.loop_data?.loop_end_slug
      );
      if (loopEndOperator) {
        childOperators = [loopEndOperator];
      }
    } else {
      await performCreditCheck(
        accountId,
        sessionSlug,
        sessionData.aurora_db_name!,
        operatorIdx,
        operator.total_credit ?? 1
      );
      const nextQueueItem = await getNextQueueItem(sessionSlug);
      if (!nextQueueItem) {
        await completeFusionSession({
          sessionSlug,
          accountId,
          responses: {
            ...responses,
            [operator.operator_slug!]: {
              responseUrl: s3Path,
            },
          },
        });
      } else if (!parallelExecution) {
        const session = await getSessionItem(sessionSlug, accountId);
        if (!session?.is_paused && !session?.is_stopped) {
          await triggerQueueItem(
            nextQueueItem,
            accountId,
            sessionData as SessionData,
            sessionSlug,
            {
              ...prevOperatorResponses,
              [operator.operator_slug!]: lastResponse,
            },
            queueItem.slug
          );
        }
      }
      return;
    }
  }

  await performCreditCheck(
    accountId,
    sessionSlug,
    sessionData.aurora_db_name!,
    operatorIdx,
    operator.total_credit ?? 1
  );

  const fusionLoops = sessionData?.loops || [];

  const loopIndex = fusionLoops.findIndex(
    (l) => l.loop_start_operator === operator.operator_slug
  );

  const isLoopStartOperator =
    loopIndex !== -1 && operator.app_module !== "loop_while";

  const executeParams = {
    ...data,
    isLoopStartOperator,
    loopIndex,
    childOperators,
    s3Path,
  };

  if (!parallelExecution) {
    await executeNextOperators(executeParams);
  } else {
    await executeNextOperatorsParallel(executeParams);
  }
};

type ExecuteNextOperatorsParams = {
  loopIndex: number;
  childOperators: SessionOperator[];
  isLoopStartOperator: boolean;
  s3Path: string;
} & FinalizeOperatorData;

const executeNextOperators = async (params: ExecuteNextOperatorsParams) => {
  const {
    moduleType,
    outputs: lastResponse,
    accountId,
    sessionSlug,
    loopIndex,
    operator,
    sessionData,
    childOperators,
    responses,
    isLoopStartOperator,
    s3Path,
    queueItem,
    prevOperatorResponses,
  } = params;

  if (
    [
      ModuleType.InstantTrigger,
      ModuleType.Trigger,
      "array_iterator",
      "basic_trigger",
      "repeater",
    ].includes(moduleType) ||
    isLoopStartOperator
  ) {
    if (!isArray(lastResponse)) {
      throw new Error("Must Return an Array");
    }

    if (isLoopStartOperator) {
      await updateSession(
        accountId,
        sessionSlug,
        `SET session_data.loops[${loopIndex}].total_iterations = :totalIterations`,
        {
          ":totalIterations": lastResponse.length,
        },
        {},
        {
          putEvents: false,
        }
      );
    }

    const session = await getSessionItem(sessionSlug, accountId);

    const prevResponses: Record<string, unknown> = {};
    const queueItems: QueueItem[] = [];
    for (const [idx, lastRes] of lastResponse.reverse().entries()) {
      for (const child of childOperators.reverse()) {
        const queueSlug = Date.now().toString();
        prevResponses[queueSlug] = lastRes;
        queueItems.push({
          id: sessionSlug,
          slug: queueSlug,
          operator_id: child.operator_slug!,
          inputs: child.operator_input_settings || {},
          index: lastResponse.length - 1 - idx,
          responses: {
            ...responses,
            [operator.operator_slug!]: {
              responseUrl: s3Path,
              index: lastResponse.length - 1 - idx,
              is_loop_operator: isLoopStartOperator,
            },
          },
        });
        await sleep(1);
      }
    }

    await insertQueueItems(queueItems);
    const nextQueueItem = await getNextQueueItem(sessionSlug);

    if (!session?.is_paused && !session?.is_stopped && nextQueueItem) {
      await triggerQueueItem(
        nextQueueItem,
        accountId,
        sessionData as SessionData,
        sessionSlug,
        {
          ...prevOperatorResponses,
          [operator.operator_slug!]: prevResponses[nextQueueItem.slug],
        },
        queueItem.slug
      );
    }
  } else {
    const session = await getSessionItem(sessionSlug, accountId);
    const queueItems: QueueItem[] = [];
    for (const child of childOperators.reverse()) {
      queueItems.push({
        id: sessionSlug,
        slug: Date.now().toString(),
        operator_id: child.operator_slug!,
        inputs: child.operator_input_settings || {},
        index: queueItem.index,
        responses: {
          ...responses,
          [operator.operator_slug!]: {
            responseUrl: s3Path,
          },
        },
      });
      await sleep(1);
    }

    await insertQueueItems(queueItems);
    const nextQueueItem = await getNextQueueItem(sessionSlug);

    if (!session?.is_paused && !session?.is_stopped && nextQueueItem) {
      await triggerQueueItem(
        nextQueueItem,
        accountId,
        sessionData as SessionData,
        sessionSlug,
        {
          ...prevOperatorResponses,
          [operator.operator_slug!]: lastResponse,
        },
        queueItem.slug
      );
    }
  }
};

const executeNextOperatorsParallel = async (
  params: ExecuteNextOperatorsParams
) => {
  const {
    moduleType,
    outputs: lastResponse,
    accountId,
    sessionSlug,
    loopIndex,
    operator,
    sessionData,
    childOperators,
    responses,
    isLoopStartOperator,
    s3Path,
    queueItem,
    prevOperatorResponses,
  } = params;

  if (
    [
      ModuleType.InstantTrigger,
      ModuleType.Trigger,
      "array_iterator",
      "basic_trigger",
      "repeater",
    ].includes(moduleType) ||
    isLoopStartOperator
  ) {
    if (!isArray(lastResponse)) {
      throw new Error("Must Return an Array");
    }

    if (isLoopStartOperator) {
      await updateSession(
        accountId,
        sessionSlug,
        `SET session_data.loops[${loopIndex}].total_iterations = :totalIterations`,
        {
          ":totalIterations": lastResponse.length,
        },
        {},
        {
          putEvents: false,
        }
      );
    }

    const session = await getSessionItem(sessionSlug, accountId);
    const prevResponses: Record<string, unknown> = {};
    for (const [idx, lastRes] of lastResponse.reverse().entries()) {
      for (const child of childOperators.reverse()) {
        const branchId = `${idx}:${v4()}`;
        const queueSlug = `${branchId}:${Date.now().toString()}`;
        prevResponses[queueSlug] = lastRes;
        const item: QueueItem = {
          id: sessionSlug,
          slug: queueSlug,
          operator_id: child.operator_slug!,
          inputs: child.operator_input_settings || {},
          index: lastResponse.length - 1 - idx,
          branch_id: branchId,
          responses: {
            ...responses,
            [operator.operator_slug!]: {
              responseUrl: s3Path,
              index: lastResponse.length - 1 - idx,
              is_loop_operator: isLoopStartOperator,
            },
          },
        };

        await insertQueueItems([item]);
        if (idx === lastResponse.length - 1) {
          const nextQueueItem = await getNextQueueItem(sessionSlug, branchId);
          if (!session?.is_paused && !session?.is_stopped && nextQueueItem) {
            await triggerQueueItem(
              nextQueueItem,
              accountId,
              sessionData as SessionData,
              sessionSlug,
              {
                ...prevOperatorResponses,
                [operator.operator_slug!]: prevResponses[nextQueueItem.slug],
              },
              queueItem.slug
            );
          }
        }
      }
    }
  } else {
    const session = await getSessionItem(sessionSlug, accountId);
    for (const [idx, child] of childOperators.reverse().entries()) {
      const branchId = idx === 0 ? queueItem.branch_id : v4();
      const item: QueueItem = {
        id: sessionSlug,
        slug: `${branchId}:${Date.now().toString()}`,
        operator_id: child.operator_slug!,
        inputs: child.operator_input_settings || {},
        index: queueItem.index,
        branch_id: branchId,
        responses: {
          ...responses,
          [operator.operator_slug!]: {
            responseUrl: s3Path,
          },
        },
      };
      await insertQueueItems([item]);
      const nextQueueItem = await getNextQueueItem(sessionSlug, branchId);

      if (!session?.is_paused && !session?.is_stopped && nextQueueItem) {
        await triggerQueueItem(
          nextQueueItem,
          accountId,
          sessionData as SessionData,
          sessionSlug,
          {
            ...prevOperatorResponses,
            [operator.operator_slug!]: lastResponse,
          },
          queueItem.slug
        );
      }
    }
  }
};

export const triggerQueueItem = async (
  queueItem: QueueItem,
  accountId: string,
  sessionData: SessionData,
  sessionSlug: string,
  prevOperatorResponses: Record<string, unknown>,
  caller?: string,
  initiateLambda?: boolean
) => {
  await processOperator({
    accountId,
    sessionOperators: sessionData?.session_operators,
    sessionSlug: sessionSlug,
    queueItem,
    roundRobin: true,
    prevOperatorResponses,
    caller,
    singleLambda: sessionData.fusion_type === FusionType.Skills,
    initiateLambda,
    sessionVariables: sessionData.session_variables,
  });
};

export const updateConnectionToken = async (data: {
  appConnection: ThreePAppConnection;
  connectionItem: FusionConnection;
  bodyData: Record<string, unknown>;
  oauthType?: string;
  appSlug: string;
  gfmlFunctions: GFMLFunction[];
  pushToLogs?: (log: FusionOperatorLog) => void;
}) => {
  const {
    appConnection,
    connectionItem,
    bodyData,
    oauthType,
    appSlug,
    gfmlFunctions,
    pushToLogs = () => {
      return;
    },
  } = data;
  if (oauthType === AuthTypes.O2ACRF) {
    if (!has(appConnection, "communication.refresh")) {
      throw new Error("Refresh method is undefined in communication");
    }

    const refreshData: Record<string, unknown> =
      appConnection?.communication.refresh;

    const newConnection = await updateAccessToken(
      refreshData,
      bodyData,
      appSlug,
      connectionItem,
      gfmlFunctions
    );
    // console.log("new_connection: ", newConnection);
    if (!newConnection) {
      throw new Error("Generate access token failed");
    }
    pushToLogs(generateLog("Access token generated", "Success", {}));
    return newConnection;
  }
};

export const getFusionWebhook = async (accountId: string, slug: string) => {
  const fusionWebhook = await dynamodb
    .get({
      TableName: envTableNames.DYNAMODB_ACCT_FUSION_WEBHOOK,
      Key: {
        id: `${accountId}:fusion_webhooks`,
        slug: slug,
      },
    })
    .then((res) => res.Item as FusionWebhook);

  return fusionWebhook;
};

export const getWebhook = async (
  accountId: string,
  webhookSlug: string,
  isGlobal = false
) => {
  const webhook = await dynamodb
    .get({
      TableName: envTableNames.DYNAMODB_ACCT_3P_APP_WEBHOOKS,
      Key: {
        id: `${isGlobal ? "3p:global" : accountId}:3p_app_webhooks`,
        slug: webhookSlug,
      },
    })
    .then((res) => res.Item as ThreePAppWebhook);

  return webhook;
};

export const addOperatorOperations = async (
  accountId: string,
  sessionSlug: string,
  operatorSlug: string,
  data: Record<string, unknown> = {
    status: "Processing",
    inputs: null,
    outputs: null,
    logs: [],
  }
) => {
  const operationId = v4();
  // console.log("🚀 ~ file: index.ts:491 ~ addOperatorOperations", operatorSlug);
  const { Attributes } = await updateSession(
    accountId,
    sessionSlug,
    "SET #sessionData.#operatorResponses.#operatorSlug.#operations = list_append(#sessionData.#operatorResponses.#operatorSlug.#operations, :operatorResponse)",
    {
      ":operatorResponse": [
        {
          id: operationId,
          data,
          created_at: Date.now(),
        },
      ],
    },
    {
      "#sessionData": "session_data",
      "#operatorResponses": "operator_responses",
      "#operatorSlug": operatorSlug,
      "#operations": "operations",
    }
  );

  const sessionData = (Attributes?.session_data || {}) as SessionData;

  return (
    sessionData?.operator_responses?.[operatorSlug]?.operations?.findIndex(
      (op) => op.id === operationId
    ) ?? 0
  );
};

function getSize(entry: PutEventsRequestEntry): number {
  let size = 0;
  if (entry.Time) {
    size += 14;
  }
  size += Buffer.byteLength(entry.Source || "", "utf8");
  size += Buffer.byteLength(entry.DetailType || "", "utf8");
  if (entry.Detail) {
    size += Buffer.byteLength(entry.Detail, "utf8");
  }
  if (entry.Resources) {
    for (const resource of entry.Resources) {
      if (resource) {
        size += Buffer.byteLength(resource, "utf8");
      }
    }
  }
  return size;
}

export const updateOperatorOperations = async (
  accountId: string,
  sessionSlug: string,
  operatorSlug: string,
  operationIdx: number,
  data: Record<string, unknown> = {}
) => {
  // console.log(
  //   "🚀 ~ file: index.ts:523 ~ updateOperatorOperations",
  //   operatorSlug,
  //   operationIdx
  // );

  const s3Path = `${accountId}/fusion-sessions/${sessionSlug}/${operatorSlug}/${operationIdx}.json`;
  const logsS3Path = `${accountId}/fusion-sessions/${sessionSlug}/${operatorSlug}/${operationIdx}.logs.json`;
  if (data.logs && isArray(data.logs)) {
    data.logs.push(
      generateLog(
        `Operation ${(operationIdx || 0) + 1} Completed with output`,
        "Complete",
        {
          responseUrl: `${S3_URL}/${s3Path}`,
        }
      )
    );
  }

  const outputs = cloneDeep(data.outputs);
  // console.log(`${S3_URL}/${s3Path}`);
  // console.log("🚀 ~ file: index.ts:644 ~ outputs:", outputs);
  const inputs = cloneDeep(data.inputs);
  const logs = cloneDeep(data.logs);
  data.outputs = {
    responsePath: `${S3_URL}/${s3Path}`,
  };
  data.inputs = undefined;
  data.logs = {
    url: `${S3_URL}/${logsS3Path}`,
  };

  // console.log(JSON.stringify(data, null, 2));

  await updateSession(
    accountId,
    sessionSlug,
    `SET #sessionData.#operatorResponses.#operatorSlug.#operations[${operationIdx}].#data = :operatorResponse`,
    {
      ":operatorResponse": data,
    },
    {
      "#sessionData": "session_data",
      "#operatorResponses": "operator_responses",
      "#operatorSlug": operatorSlug,
      "#operations": "operations",
      "#data": "data",
    }
  );

  if (logs) {
    const eventSize = getSize({
      EventBusName: `${FUSION_EVENT_BUS_NAME_PREFIX}-FusionEvents`,
      Source: `${FUSION_EVENT_BUS_NAME_PREFIX}-FusionEvents`,
      Detail: JSON.stringify({
        accountId,
        sessionSlug,
        operatorSlug,
        operationIdx,
        data: logs,
      }),
      DetailType: `${FUSION_EVENT_BUS_NAME_PREFIX}-OperatorLog`,
    });
    if (eventSize / 1024 <= 250) {
      await putOperatorLogs({
        accountId,
        sessionSlug,
        operatorSlug,
        operationIdx,
        data: logs,
      });
    } else {
      const buffer = Buffer.from(JSON.stringify(data));

      const s3 = await getS3Client();

      await s3
        .putObject({
          Bucket: MEDIA_BUCKET_NAME!,
          Key: logsS3Path,
          ContentType: "application/json",
          ContentEncoding: "base64",
          Body: buffer,
        })
        .promise();
    }
  }

  console.log(`${S3_URL}/${s3Path}`);
  await uploadSessionOperationToS3(s3Path, {
    inputs,
    outputs,
  });

  return s3Path;
};
const assumeRoleForS3 = async () => {
  if (!MAIN_ACCT_ACCESS_ROLE_ARN || !MAIN_ACCT_ACCESS_ROLE_SESSION_NAME) {
    throw new Error(
      "MAIN_ACCT_ACCESS_ROLE_ARN and MAIN_ACCT_ACCESS_ROLE_SESSION_NAME must be specified"
    );
  }

  const stsSession = await stsClient
    .assumeRole({
      RoleArn: MAIN_ACCT_ACCESS_ROLE_ARN,
      RoleSessionName: MAIN_ACCT_ACCESS_ROLE_SESSION_NAME,
    })
    .promise();

  if (!stsSession.Credentials) {
    throw new Error(`Could not assume role ${MAIN_ACCT_ACCESS_ROLE_ARN}`);
  }

  return stsSession.Credentials;
};

const assumeRoleForYTCombS3 = async () => {
  if (!YTCOMB_ACCT_ACCESS_ROLE_ARN || !YTCOMB_ACCT_ACCESS_ROLE_SESSION_NAME) {
    throw new Error(
      "MAIN_ACCT_ACCESS_ROLE_ARN and MAIN_ACCT_ACCESS_ROLE_SESSION_NAME must be specified"
    );
  }

  const stsClient = new STS();
  const stsSession = await stsClient
    .assumeRole({
      RoleArn: YTCOMB_ACCT_ACCESS_ROLE_ARN,
      RoleSessionName: YTCOMB_ACCT_ACCESS_ROLE_SESSION_NAME,
    })
    .promise();

  if (!stsSession.Credentials) {
    throw new Error(`Could not assume role ${YTCOMB_ACCT_ACCESS_ROLE_ARN}`);
  }

  return stsSession.Credentials;
};

export const getS3Client = async () => {
  // if (s3) {
  //   return s3;
  // }
  let s3 = new S3({
    signatureVersion: "v4",
    region: REGION,
  });
  if (ACCT_NAME !== "main") {
    const { AccessKeyId, SecretAccessKey, SessionToken } =
      await assumeRoleForS3();
    s3 = new S3({
      signatureVersion: "v4",
      region: REGION,
      credentials: {
        accessKeyId: AccessKeyId,
        secretAccessKey: SecretAccessKey,
        sessionToken: SessionToken,
      },
    });
  }

  return s3;
};

export const getYTCombS3Client = async () => {
  const { AccessKeyId, SecretAccessKey, SessionToken } =
    await assumeRoleForYTCombS3();
  const s3 = new S3({
    signatureVersion: "v4",
    region: REGION,
    credentials: {
      accessKeyId: AccessKeyId,
      secretAccessKey: SecretAccessKey,
      sessionToken: SessionToken,
    },
  });

  return s3;
};

// export const getExecutionQueue = async (
//   accountSlug: string,
//   sessionSlug: string
// ) => {
//   const s3 = await getS3Client();

//   const response = await s3
//     .getObject({
//       Bucket: MEDIA_BUCKET_NAME!,
//       Key: `${accountSlug}/fusion_sessions/${sessionSlug}/execution_queue.json`,
//     })
//     .promise();

//   const resStr = response.Body?.toString("utf8") || "[]";

//   return JSON.parse(resStr) as SessionQueueItem[];
// };

// export const updateExecutionQueue = async (
//   accountSlug: string,
//   sessionSlug: string,
//   queue: SessionQueueItem[]
// ) => {
//   console.log("🚀 ~ file: index.ts:735 ~ queue:", queue.length);
//   const s3 = await getS3Client();

//   await s3
//     .putObject({
//       Bucket: MEDIA_BUCKET_NAME!,
//       Key: `${accountSlug}/fusion_sessions/${sessionSlug}/execution_queue.json`,
//       Body: Buffer.from(JSON.stringify(queue), "utf8"),
//     })
//     .promise();
// };

export const uploadSessionOperationToS3 = async (
  s3Path: string,
  data: Record<string, unknown> = {}
) => {
  // console.log("🚀 ~ file: index.ts:558 ~ data", data, s3Path);
  const s3 = await getS3Client();

  const buffer = Buffer.from(JSON.stringify(data));

  await s3
    .putObject({
      Bucket: MEDIA_BUCKET_NAME!,
      Key: s3Path,
      ContentType: "application/json",
      ContentEncoding: "base64",
      Body: buffer,
    })
    .promise();
};

const getOperatorsFromTag = (value: unknown) => {
  const operators: Set<string> = new Set();
  if (isString(value)) {
    if (!hasTags(value)) {
      return [];
    }
    const str = value;
    const chunks = str.split(/\[\[|\]\]/).filter((v) => !!v.trim());
    chunks.forEach((chunk) => {
      const tag = getIfTag(chunk);
      if (tag == null) {
        return;
      }

      if (tag.type === "variable") {
        operators.add(tag.slug.split(".")[0]);
      }
    });
  } else if (isPlainObject(value)) {
    Object.values(value as Record<string, unknown>).forEach((v) => {
      const ops = getOperatorsFromTag(v);
      ops.forEach((o) => operators.add(o));
    });
  } else if (isArray(value)) {
    value.forEach((v) => {
      getOperatorsFromTag(v).forEach((o) => operators.add(o));
    });
  }

  return [...operators];
};

export const getPrevOperatorResponses = async (
  value: unknown,
  argResponses: Record<string, { responseUrl: string; index?: number }>,
  operatorSlugs: string[] = []
) => {
  const responses = cloneDeep(argResponses);
  // console.time("getPrevOperatorResponses");
  // console.log("🚀 ~ file: index.ts:728 ~ responses", responses, value);
  const prevOperatorUsed = getOperatorsFromTag(value);
  // console.log("🚀 ~ file: index.ts:731 ~ prevOperatorUsed", prevOperatorUsed);

  const slugs = [
    ...new Set([
      ...prevOperatorUsed,
      ...operatorSlugs,
      "chart_inputs",
      "popup_variables",
    ]),
  ];

  const prevOperatorResponses = slugs.reduce<
    Record<
      string,
      { responseUrl: string; index?: number; is_loop_operator?: boolean }
    >
  >((acc, cur) => {
    acc[cur] = responses[cur];
    return acc;
  }, {});
  // console.log(
  //   "🚀 ~ file: index.ts:734 ~ prevOperatorResponses",
  //   prevOperatorResponses
  // );

  const s3 = await getS3Client();

  if (!isEmpty(prevOperatorResponses["popup_variables"])) {
    for (const [key, value] of Object.entries(
      prevOperatorResponses["popup_variables"]
    )) {
      if ((value as any)?.type === "s3_file" && (value as any)?.s3_url) {
        const s3FilePath = new URL((value as any).s3_url as string).pathname;

        const res = await s3
          .getObject({
            Bucket: MEDIA_BUCKET_NAME!,
            Key: decodeURIComponent(s3FilePath.slice(1)),
          })
          .promise();

        set(prevOperatorResponses["popup_variables"], key, res.Body);
      }
    }
  }

  const result = (
    await Promise.all(
      Object.entries(prevOperatorResponses).map(async ([key, value]) => {
        if (!value?.responseUrl) {
          return {
            key,
            data: value,
          };
        }
        const res = await s3
          .getObject({
            Bucket: MEDIA_BUCKET_NAME!,
            Key: value.responseUrl,
          })
          .promise();
        try {
          const data = JSON.parse(res.Body?.toString("utf-8") || "{}");
          // console.log("🚀 ~ file: index.ts:757 ~ Object.entries ~ data", data);
          if (value.index != null) {
            const outputs = parseBuffers(data?.outputs?.[value.index]);
            if (value.is_loop_operator) {
              return {
                key,
                data: {
                  item: outputs,
                  data: data?.outputs || [],
                  total_records: data?.outputs?.length || 0,
                  index: value.index,
                },
              };
            }
            return {
              key,
              data: outputs,
            };
          } else {
            const outputs = parseBuffers(data?.outputs);
            return {
              key,
              data: outputs,
            };
          }
        } catch (e) {
          console.log("🚀 ~ file: index.ts:770 ~ Object.entries ~ e", e);
          return {
            key,
            data: {},
          };
        }
      })
    )
  ).reduce<Record<string, unknown>>((acc, cur) => {
    acc[cur.key] = cur.data;
    return acc;
  }, {});
  // console.log("🚀 ~ file: index.ts:780 ~ result", result);

  // console.timeEnd("getPrevOperatorResponses");

  return {
    ...responses,
    ...result,
  };
};

const parseBuffers = (data: any): unknown => {
  if (!data) {
    return data;
  }

  if (
    data.type === "Buffer" &&
    isArray(data.data) &&
    (data.data as any[]).every((d) => isNumber(d))
  ) {
    console.log("to buffer", data.data);
    return Buffer.from(data.data as number[]);
  }

  if (isPlainObject(data)) {
    return Object.entries(data as Record<string, unknown>).reduce<
      Record<string, unknown>
    >((acc, [key, value]) => {
      acc[key] = parseBuffers(value);

      return acc;
    }, {});
  }

  if (isArray(data)) {
    return data.map((d) => parseBuffers(d));
  }

  return data;
};
