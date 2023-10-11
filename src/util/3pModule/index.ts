/* eslint-disable indent */
import { S3 } from "aws-sdk";
import DynamoDB from "aws-sdk/clients/dynamodb";
import axios, { AxiosHeaders, AxiosRequestConfig, Method } from "axios";
import FormData from "form-data";
import { omit } from "lodash";
import find from "lodash/find";
import isEmpty from "lodash/isEmpty";
import set from "lodash/set";
import moment from "moment";
import qs from "qs";
import { Readable } from "stream";
import {
  ACCOUNTS_TABLE_NAME,
  FUSION_EVENT_BUS_NAME_PREFIX,
  MEDIA_BUCKET_NAME,
  REGION,
  envTableNames,
} from "../../config";
import {
  AUTOMATION_MODULES,
  AWS_MODULES,
  BASIC_SYSTEM_MODULES,
  CHART_DATA_MODULES,
  CHAT_MODULES,
  CRUD_MODULES,
  FLOW_CONTROL_MODULES,
  FlowControlOperators,
  FusionLambda,
  SKILL_MODULES,
} from "../../constants/3pApp";
import { InvocationType } from "../../enums/lambda";
import { FusionOperatorLogEvent } from "../../functions/fusionSessions/generateFusionOperatorLogs";
import { ParseOptions, parseExpression } from "../../helpers/3pExpression";
import { dynamodb } from "../../helpers/db";
import { putEvents } from "../../helpers/eventBridge";
import { invokeLambda } from "../../helpers/lambda";
import { Account } from "../../types";
import {
  FusionConnection,
  FusionOperator,
  FusionOperatorLog,
  FusionSession,
  SessionOperator,
} from "../../types/Fusion";
import {
  GFMLFunction,
  MultipartBody,
  ThreePApp,
  ThreePAppCommunication,
  ThreePAppConnection,
  ThreePAppModule,
} from "../../types/Fusion/3pApp";
import { getFusion } from "../fusion";

type ExpressionAttributeValueMap =
  DynamoDB.DocumentClient.ExpressionAttributeValueMap;

export const getSessionItem = async (
  sessionSlug: string,
  accountId: string
) => {
  const res = await dynamodb.get({
    TableName: `${envTableNames.DYNAMODB_ACCT_FUSION_SESSION_V2}`,
    Key: { id: `${accountId}:fusion_sessions`, slug: sessionSlug },
  });

  return res.Item as FusionSession;
};

export const generateLog = (
  message: string,
  status: FusionOperatorLog["status"],
  payload?: unknown
): FusionOperatorLog => {
  return {
    message,
    timestamp: moment().format(),
    status,
    payload,
  };
};

export const is3pApp = (app: ThreePApp) => {
  return app.id.startsWith("3p:global");
};

export const isBasicSystemOperator = (
  operator: FusionOperator | SessionOperator
) => {
  const { app, app_module } = operator || {};
  return app === "system" && BASIC_SYSTEM_MODULES.includes(`${app_module}`);
};

export const isSkillOperator = (operator: FusionOperator | SessionOperator) => {
  const { app, app_module } = operator || {};
  return app === "system" && SKILL_MODULES.includes(`${app_module}`);
};

export const isAWSOperator = (operator: FusionOperator | SessionOperator) => {
  const { app, app_module } = operator || {};
  return app === "system" && AWS_MODULES.includes(`${app_module}`);
};

export const isFlowControlOperator = (
  operator: FusionOperator | SessionOperator
) => {
  const { app, app_module } = operator || {};
  return app === "system" && FLOW_CONTROL_MODULES.includes(`${app_module}`);
};

export const isChatOperator = (operator: FusionOperator | SessionOperator) => {
  const { app, app_module } = operator || {};
  return app === "system" && CHAT_MODULES.includes(`${app_module}`);
};

export const isStripeOperator = (
  operator: FusionOperator | SessionOperator
) => {
  const { app, app_module } = operator || {};
  return app === "system" && app_module === "charge_payment";
};

export const isCrudOperator = (operator: FusionOperator | SessionOperator) => {
  const { app, app_module } = operator || {};
  return app === "system" && CRUD_MODULES.includes(`${app_module}`);
};

export const isAutomationOperator = (
  operator: FusionOperator | SessionOperator
) => {
  const { app, app_module } = operator || {};
  return app === "system" && AUTOMATION_MODULES.includes(`${app_module}`);
};

export const isChartDataOperator = (
  operator: FusionOperator | SessionOperator
) => {
  const { app, app_module } = operator || {};
  return app === "system" && CHART_DATA_MODULES.includes(`${app_module}`);
};

export const isChartOperator = (operator: FusionOperator | SessionOperator) => {
  const { app, app_module } = operator || {};
  return (
    app === "system" &&
    (app_module === "chart-node" || app_module?.startsWith("data-list-widget"))
  );
};

export const isRestApiOperator = (
  operator: FusionOperator | SessionOperator
) => {
  const { app, app_module } = operator || {};
  return app === "system" && app_module === "rest_api";
};

export const isWebhookResponseOperator = (
  operator: FusionOperator | SessionOperator
) => {
  const { app, app_module } = operator || {};
  return app === "system" && app_module === "webhook_response";
};

export const isImportOperator = (operator: FusionOperator) => {
  const { app, app_module } = operator || {};
  return app === "system" && app_module === "import";
};

export const isGetNextTaskOperator = (
  operator: FusionOperator | SessionOperator
) => {
  const { app, app_module } = operator || {};
  return app === "system" && app_module === "get_next_task";
};

export const isCompleteTaskOperator = (
  operator: FusionOperator | SessionOperator
) => {
  const { app, app_module } = operator || {};
  return app === "system" && app_module === "complete_task";
};

export const isSkippableOperator = (
  operator: FusionOperator | SessionOperator
) => {
  const { app_module } = operator || {};
  return [
    "chat_start_operator",
    "widget-start-operator",
    "webhook",
    "import",
    "document_create",
    "document_edit",
    "document_delete",
    "event",
    // "chart-node",
  ].includes(`${app_module}`);
};

export const isAggregatorOperator = (appModule: string) => {
  return [
    "text_aggregator",
    "table_aggregator",
    "numeric_aggregator",
    "array_aggregator",
  ].includes(appModule);
};

const s3 = new S3({
  signatureVersion: "v4",
  region: REGION,
});

const BUCKET_NAME = `${MEDIA_BUCKET_NAME}`;

export const updateSessionStatus = async (
  session_slug: string,
  status: string | null,
  accountId: string,
  payload?: unknown
) => {
  if (!session_slug) {
    throw new Error("Session Slug and Table Name are required");
  }

  if (!status && !payload) {
    return;
  }

  const updateExpression = `set ${
    status ? "session_data.session_status = :session_status" : ""
  }${payload ? (status ? ", " : "") + "final_payload = :final_payload" : ""}`;
  const expressionAttributeValues: ExpressionAttributeValueMap = {};
  if (status) {
    expressionAttributeValues[":session_status"] = status;
  }
  if (payload) {
    expressionAttributeValues[":final_payload"] = payload;
  }
  const { Attributes } = await updateSession(
    accountId,
    session_slug,
    updateExpression,
    expressionAttributeValues,
    {},
    { putEvents: true }
  );

  if (Attributes && status === "Failed") {
    const updatedSession = Attributes as FusionSession;

    if (
      updatedSession.session_data.fusion_type === "import" &&
      updatedSession.session_data.chunk_index != null &&
      updatedSession.session_data.import_chunk &&
      updatedSession.session_data.import_chunk.type === "csv"
    ) {
      const chunk =
        updatedSession.session_data.import_chunk.chunk_data[
          updatedSession.session_data.chunk_index
        ];

      const fusion = await getFusion(updatedSession.fusion_slug, accountId);

      const headerKeys = (fusion?.meta_data?.record_keys as string[]) || [];
      const csvString = `${headerKeys.reduce<string>((acc, k) => {
        return `${acc}${acc ? "," : ""}${chunk[k]}`;
      }, "")}\n`;

      const errorFilePath = `${accountId}/imports/unprocessed-data/${updatedSession.session_data.import_chunk.upload_design_slug}`;

      const data = await s3
        .getObject({
          Bucket: BUCKET_NAME,
          Key: errorFilePath,
        })
        .promise();
      if (data.Body) {
        const updatedData = `${data.Body.toString()}${csvString}`;

        await s3
          .putObject({
            Body: updatedData,
            Bucket: BUCKET_NAME,
            Key: errorFilePath,
            ContentType: "text/csv",
          })
          .promise();
      }
    }
  }
};

export const updateSessionOperatorStatus = async (
  sessionSlug: string,
  operatorStatus: string | null,
  operatorIdx: number,
  accountId: string
) => {
  return await updateSession(
    accountId,
    sessionSlug,
    `set session_data.session_operators[${operatorIdx}].operator_status = :newValue`,
    {
      ":newValue": operatorStatus,
    }
  );
};

export const updateSessionVariables = async (
  sessionSlug: string,
  sessionVariables: Record<string, any>,
  accountId: string
) => {
  return await updateSession(
    accountId,
    sessionSlug,
    "set session_data.session_variables = :session_variables",
    {
      ":session_variables": sessionVariables,
    },
    {},
    {
      putEvents: false,
    }
  );
};

export const updateSessionIterators = async (
  sessionSlug: string,
  iterators: Record<string, any>,
  accountId: string
) => {
  return await updateSession(
    accountId,
    sessionSlug,
    "set session_data.iterators = :iterators",
    {
      ":iterators": iterators,
    },
    {},
    {
      putEvents: false,
    }
  );
};

export const updateSession = async (
  accountId: string,
  sessionSlug: string,
  updateExpression: string,
  expressionAttributeValues: Record<string, any>,
  expressionAttributeNames?: Record<string, any>,
  options: {
    putEvents?: boolean;
  } = { putEvents: true }
) => {
  let expression = updateExpression;
  if (expression.toLowerCase().startsWith("set ")) {
    expression = `${expression}, #sua = :sua`;
  } else {
    expression = `${expression} set #sua = :sua`;
  }
  const params: DynamoDB.DocumentClient.UpdateItemInput = {
    TableName: `${envTableNames.DYNAMODB_ACCT_FUSION_SESSION_V2}`,
    Key: {
      id: `${accountId}:fusion_sessions`,
      slug: sessionSlug,
    },
    UpdateExpression: expression,
    ...(!isEmpty(expressionAttributeValues)
      ? {
          ExpressionAttributeValues: {
            ...expressionAttributeValues,
            ":sua": moment.utc().format(),
          },
        }
      : {
          ExpressionAttributeValues: { ":sua": moment.utc().format() },
        }),
    ...(!isEmpty(expressionAttributeNames)
      ? {
          ExpressionAttributeNames: {
            ...expressionAttributeNames,
            "#sua": "updated_at",
          },
        }
      : { ExpressionAttributeNames: { "#sua": "updated_at" } }),
    ReturnValues: "ALL_NEW",
  };
  // console.log(JSON.stringify(params, null, 2));
  const updateRes = await dynamodb.update(params, 2);
  // console.log(
  //   "🚀 ~ file: index.ts:298 ~ updateRes:",
  //   updateRes.Attributes,
  //   options?.putEvents
  // );

  if (options?.putEvents && updateRes.Attributes) {
    await sendFusionNotification(
      omit(updateRes.Attributes, "session_data.execution_queue")
    );
  }

  // console.log("returning session");

  return updateRes;
};

export const sendFusionNotification = async (data: unknown) => {
  if (!data) {
    return;
  }

  // console.log("putting events");

  await putEvents([
    {
      EventBusName: `${FUSION_EVENT_BUS_NAME_PREFIX}-FusionEvents`,
      Source: `${FUSION_EVENT_BUS_NAME_PREFIX}-FusionEvents`,
      Detail: JSON.stringify(data),
      DetailType: `${FUSION_EVENT_BUS_NAME_PREFIX}-FusionSession`,
    },
  ]);
  // console.log("done");
};

export const putOperatorLogs = async (data: FusionOperatorLogEvent) => {
  if (!data) {
    return;
  }

  await putEvents([
    {
      EventBusName: `${FUSION_EVENT_BUS_NAME_PREFIX}-FusionEvents`,
      Source: `${FUSION_EVENT_BUS_NAME_PREFIX}-FusionEvents`,
      Detail: JSON.stringify(data),
      DetailType: `${FUSION_EVENT_BUS_NAME_PREFIX}-OperatorLog`,
    },
  ]);
};

export const get3pApp = async (appSlug: string, accountId: string) => {
  const res = await dynamodb.get({
    TableName: `${envTableNames.DYNAMODB_ACCT_3P_APPS}`,
    Key: { id: `${accountId}:3p_apps`, slug: appSlug },
  });

  return res.Item as ThreePApp;
};

export const getAppConfig = async (
  tableName: string,
  appId: string,
  app: string
) => {
  const res = await dynamodb.query({
    TableName: `${envTableNames.DYNAMODB_ACCT_3P_CONFIGS}`,
    FilterExpression: "#is_deleted = :is_deleted",
    KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
    ExpressionAttributeNames: {
      "#is_deleted": "is_deleted",
      "#id": "id",
      "#slug": "slug",
    },
    ExpressionAttributeValues: {
      ":id": `3p_app_config:${appId}:${app}`,
      ":is_deleted": false,
      ":slug": "false:",
    },
  });
  // .catch((err) => {
  //   console.log("getAppConfig Error: ", err);
  // });
  // console.log("getAppConfig", { res });

  return res.Items?.[0];
};

export const getAppConnection = async (
  connectionSlug: string,
  accountId: string
) => {
  const res = await dynamodb.query({
    TableName: `${envTableNames.DYNAMODB_ACCT_3P_APP_CONNECTIONS}`,
    KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
    FilterExpression: "#is_deleted = :is_deleted",
    ExpressionAttributeNames: {
      "#is_deleted": "is_deleted",
      "#id": "id",
      "#slug": "slug",
    },
    ExpressionAttributeValues: {
      ":id": `${accountId}:3p_app_connections`,
      ":is_deleted": false,
      ":slug": connectionSlug,
    },
  });
  return res.Items?.[0] as ThreePAppConnection;
};

export const getAppModule = async (appModule: string, accountId: string) => {
  const res = await dynamodb.get({
    TableName: `${envTableNames.DYNAMODB_ACCT_3P_ACTIONS}`,
    Key: {
      id: `${accountId}:3p_app_actions`,
      slug: appModule,
    },
  });

  return res.Item as ThreePAppModule;
};

export const getFusionConnection = async (
  connectionSlug: string,
  accountId: string
) => {
  const res = await dynamodb.get({
    TableName: `${envTableNames.DYNAMODB_ACCT_FUSION_CONNECTION}`,
    Key: {
      id: `${accountId}:fusion_connections`,
      slug: connectionSlug,
    },
  });

  return res.Item as FusionConnection;
};

export const checkIfExpired = (connection: Record<string, unknown>) => {
  if (connection.expires && connection.expires != "") {
    if (new Date(connection.expires as string) > new Date()) {
      return false; //Update Not Needed
    }
  }
  return true;
};

export const updateOperatorLogs = async (
  sessionSlug: string,
  operatorIdx: number,
  operatorStatus: string,
  operatorLogs: FusionOperatorLog[],
  accountId: string
) => {
  // const exCycleExpression =
  //   operatorStatus === "Complete" || operatorStatus === "Success"
  //     ? `, session_data.session_operators[${operatorIdx}].execution_cycle = session_data.session_operators[${operatorIdx}].execution_cycle + :inc`
  //     : "";
  await updateSession(
    accountId,
    sessionSlug,
    // session_data.session_operators[${operatorIdx}].operator_logs = :operator_logs,
    // session_data.session_operators[${operatorIdx}].was_paused = :was_paused${exCycleExpression}
    `SET session_data.session_operators[${operatorIdx}].operator_status = :operator_status, session_data.session_operators[${operatorIdx}].updated_at = :updated_at`,
    {
      ":operator_status": operatorStatus,
      // ":operator_logs": operatorLogs,
      ":updated_at": moment().format(),
      // ":was_paused": false,
      // ...(operatorStatus === "Complete" || operatorStatus === "Success"
      //   ? { ":inc": 1 }
      //   : {}),
    }
  );
};

export async function pauseOperator(
  sessionSlug: string,
  operatorIdx: number,
  accountId: string
) {
  //SET STATUS AS COMPLETE
  await updateSession(
    accountId,
    sessionSlug,
    `set session_data.session_operators[${operatorIdx}].was_paused = :newValue`,
    {
      ":newValue": true,
    }
  );
}

type FusionLambdaInput = {
  sessionSlug: string;
  operatorSlug: string;
  appSlug: string;
  appModuleSlug: string;
  tableName: string;
  triggerRespItem: Record<string, any>;
  accountId: string;
};

export const callOperatorLambda = async (data: FusionLambdaInput) => {
  // console.log("Process CRUD Operator");
  return await invokeLambda(
    FusionLambda.ProcessCrudOperators,
    data,
    InvocationType.Event
  );
};

export async function processCrudOperator(data: FusionLambdaInput) {
  // console.log("Process CRUD Operator");
  return await invokeLambda(
    FusionLambda.ProcessCrudOperators,
    data,
    InvocationType.Event
  );
}

export async function processAutomationOperator(data: FusionLambdaInput) {
  // console.log("Process Automation Operator");
  return await invokeLambda(
    FusionLambda.ProcessAutomationOperators,
    data,
    InvocationType.Event
  );
}

export async function processGetNextTaskOperator(data: FusionLambdaInput) {
  // console.log("Process Next Task Operator");
  return await invokeLambda(
    FusionLambda.ProcessGetNextTaskOperators,
    data,
    InvocationType.Event
  );
}

export async function processCompleteTaskOperator(data: FusionLambdaInput) {
  // console.log("Process Complete Task Operator");
  return await invokeLambda(
    FusionLambda.ProcessCompleteTaskOperators,
    data,
    InvocationType.Event
  );
}

export async function processChatOperator(data: FusionLambdaInput) {
  // console.log("Process CHAT Operator");
  return await invokeLambda(
    FusionLambda.ProcessChatOperators,
    data,
    InvocationType.Event
  );
}

export async function processStripeOperators(data: FusionLambdaInput) {
  // console.log("Process Stripe Operator");
  return await invokeLambda(
    FusionLambda.ProcessStripeOperators,
    data,
    InvocationType.Event
  );
}

export async function processRestApiOperator(data: FusionLambdaInput) {
  // console.log("Process Rest-API Operator");
  return await invokeLambda(
    FusionLambda.ProcessRestApiOperators,
    data,
    InvocationType.Event
  );
}

export async function callCompleteSession(
  session_slug: string,
  isPause: boolean,
  isStop: boolean,
  payload?: Record<string, any> | null,
  extra?: Record<string, any>
) {
  // console.log("Call Complete Session");
  return await invokeLambda(
    FusionLambda.CompleteAutomationSession,
    {
      ...extra,
      sessionSlug: session_slug,
      isPause,
      isStop,
      payload,
    },
    InvocationType.Event
  );
}

export async function triggerChildOperator(
  sessionSlug: string,
  item: Record<string, any>,
  childOperators: SessionOperator[],
  payload?: Record<string, any>,
  updatedOperatorData?: SessionOperator[]
) {
  //Get Child Operators
  // console.log("Trigger Child Operator");

  for (const child of childOperators) {
    const pass = true;
    // checkConditions(
    //   child.operator_slug || "",
    //   updatedOperatorData || []
    // );
    // console.log(`Operator: ${child.operator_slug} : ${pass}`);
    if (!pass) {
      const accountId: string = payload?.accountId;
      await updateChildOperators(
        child.operator_slug || "",
        updatedOperatorData || [],
        sessionSlug,
        accountId || ""
      ); //Update status of all child ops
      continue;
    }
    await invokeLambda(
      FusionLambda.ProcessOperators,
      {
        ...payload,
        sessionSlug,
        operatorSlug: child.operator_slug,
        appSlug: child.app,
        appModuleSlug: child.app_module,
        triggerRespItem: item,
      },
      InvocationType.RequestResponse
    );
  }
}

export async function updateChildOperators(
  operatorSlug: string,
  session_operators: SessionOperator[],
  sessionSlug: string,
  accountId: string
) {
  //Update status of parent operator
  const operatorIdx = session_operators.findIndex(
    (operator) => operator.operator_slug === operatorSlug
  );
  await updateOperatorLogs(sessionSlug, operatorIdx, "Complete", [], accountId);

  //Check for sub childs
  const subChilds = session_operators.filter(
    (operator) => operator.parent_operator_slug === operatorSlug
  );

  for (const child of subChilds) {
    await updateChildOperators(
      child.operator_slug || "",
      session_operators,
      sessionSlug,
      accountId
    );
  }

  //Call Complete Session
  if (subChilds.length < 1) {
    await callCompleteSession(sessionSlug, true, false);
  }
}
export async function callChildOperators(
  sessionSlug: string,
  childOperators: SessionOperator[],
  triggerRespItem: Record<string, any>,
  invocationType?: InvocationType,
  payload?: Record<string, any>,
  updatedOperatorData?: SessionOperator[]
) {
  // console.log("Call Child Operators");
  for (const child of childOperators) {
    const pass = true;
    // checkConditions(
    //   child.operator_slug || "",
    //   updatedOperatorData || []
    // );
    // console.log(`Operator: ${child.operator_slug} : ${pass}`);
    if (!pass) {
      const accountId: string = payload?.accountId;
      await updateChildOperators(
        child.operator_slug || "",
        updatedOperatorData || [],
        sessionSlug,
        accountId || ""
      ); //Update status of all child ops
      continue;
    }
    await invokeLambda(
      FusionLambda.ExecuteOperators,
      {
        ...payload,
        sessionSlug: sessionSlug,
        operatorSlug: child.operator_slug,
        triggerRespItem,
      },
      invocationType || InvocationType.Event
    );
  }
}

const getRequestBody = <T = any>(body: T, type: string) => {
  switch (type) {
    case "urlencoded":
      return qs.stringify(body);
    default:
      return body;
  }
};

// export function checkConditions(
//   operator_slug: string,
//   updatedOperatorData: SessionOperator[]
// ): boolean {
//   //Check Main Conditions
//   const operatorObject: SessionOperator =
//     updatedOperatorData.find((obj) => obj.operator_slug === operator_slug) ||
//     {};

//   const conditionSet = operatorObject?.edge_data?.condition_sets || []; //Holder of OR Conditions
//   let finalDecision = true;

//   for (const set of conditionSet) {
//     finalDecision = true;
//     const conditions = set.conditions; //Holder of AND Conditions
//     for (const condition of conditions) {
//       console.log(
//         `Condition: ${condition.lhs_value} ${condition.comparison_value} ${condition.rhs_value}`
//       );
//       if (condition.comparison_value == "=") {
//         if (condition.lhs_value == condition.rhs_value) {
//           continue;
//         }
//         finalDecision = false;
//         break;
//       } else if (condition.comparison_value == "!=") {
//         if (condition.lhs_value != condition.rhs_value) {
//           continue;
//         }
//         finalDecision = false;
//         break;
//       } else if (condition.comparison_value == ">") {
//         if (condition.lhs_value > condition.rhs_value) {
//           continue;
//         }
//         finalDecision = false;
//         break;
//       } else if (condition.comparison_value == "<") {
//         if (condition.lhs_value < condition.rhs_value) {
//           continue;
//         }
//         finalDecision = false;
//         break;
//       } else if (condition.comparison_value == ">=") {
//         if (condition.lhs_value >= condition.rhs_value) {
//           continue;
//         }
//         finalDecision = false;
//         break;
//       } else if (condition.comparison_value == "<=") {
//         if (condition.lhs_value <= condition.rhs_value) {
//           continue;
//         }
//         finalDecision = false;
//         break;
//       }
//     }
//     if (finalDecision == true) {
//       break;
//     }
//   }
//   return finalDecision;
// }

export async function applyConditonalValues(
  session_operators: SessionOperator[],
  operators: SessionOperator[],
  parseOptions: ParseOptions
) {
  for (const operator of operators) {
    const operatorData = session_operators.find(
      (obj) => obj.operator_slug === operator.operator_slug
    );

    if (Object.prototype.hasOwnProperty.call(operatorData, "edge_data")) {
      let edgeDataParse = operatorData?.edge_data;
      edgeDataParse = await parseExpression(edgeDataParse, parseOptions);

      for (const session of session_operators) {
        if (session.operator_slug === operator.operator_slug) {
          session.edge_data = edgeDataParse;
        }
      }
    }
  }

  return session_operators;
}

export async function updateAccessToken(
  refreshMethod: Record<string, unknown>,
  bodyData: Record<string, unknown>,
  app: string,
  connectionItem: FusionConnection,
  gfmlFunctions?: GFMLFunction[]
) {
  // console.log("Update Access Token: ", {
  //   refreshMethod,
  //   bodyData,
  //   app,
  //   connectionItem,
  //   gfmlFunctions: gfmlFunctions?.length,
  // });
  try {
    const options: ParseOptions = {
      body: bodyData,
      responses: {},
      mappableParameters: [],
    };
    gfmlFunctions ? (options.functions = gfmlFunctions) : (options.app = app);
    const url = await parseExpression<string>(refreshMethod.url, options);
    // console.log("URL", url);
    const method = await parseExpression<Method>(refreshMethod.method, options);
    // console.log("Method", method);
    const body = await parseExpression(refreshMethod.body, options);
    // console.log("Body", body);
    const headers = await parseExpression<AxiosHeaders>(
      refreshMethod.headers,
      options
    );
    // console.log("Headers", headers);

    //Iterate Payload For Axios
    const axios_payload: AxiosRequestConfig = {
      url,
      method,
      data: getRequestBody(body, `${refreshMethod.type}`),
      headers,
    };
    // console.log("Axios Payload", axios_payload);

    const response = await axios.request(axios_payload);
    // console.log("Response", response);
    set(options, "body.body", {
      ...response.data,
      refresh_token: connectionItem.meta_data.refreshToken,
    });
    // console.log("Options after response body application: ", options);
    const parsedResponse = await parseExpression<{ data: unknown }>(
      refreshMethod.response,
      options
    );
    // console.log(
    //   "Parsed Response",
    //   parsedResponse,
    //   "Connection Item: ",
    //   connectionItem
    // );
    await updateMetaData(connectionItem, parsedResponse.data);
    // console.log("Updated Access Token End!");
    return parsedResponse.data;
  } catch (e) {
    console.log("Access Token Error: ", e);
  }
}

async function updateMetaData(
  connectionItem: FusionConnection,
  connection: unknown
) {
  // console.log("Update Meta Data", { connectionItem, connection });
  const params = {
    TableName: `${envTableNames.DYNAMODB_ACCT_FUSION_CONNECTION}`,
    Key: {
      id: connectionItem.id,
      slug: connectionItem.slug,
    },
    UpdateExpression: "set meta_data = :newValue",
    ExpressionAttributeValues: {
      ":newValue": connection,
    },
  };
  await dynamodb.update(params);
}

type CreditType = "operator" | "usage" | "chat";

export const checkHasCredits = async (
  accountId: string,
  credits: number,
  type: CreditType = "operator"
) => {
  console.log("getting account");
  const account = await getAccountItem(accountId);
  console.log(
    "🚀 ~ file: index.ts ~ line 688 ~ account",
    JSON.stringify(account, null, 2)
  );

  if (account) {
    console.log(
      `Available credits id=${accountId}: ${account[`${type}_credits`]}`
    );
    return (account[`${type}_credits`] || 0) > credits;
  }
  throw new Error("no account");
};

export const consumeCredits = async (
  accountId: string,
  deductCredits = 0,
  type: CreditType = "operator"
) => {
  // console.log("Consume Credit");
  if (!accountId) {
    console.log("Invalid Arguments: ", { accountId, deductCredits });
    throw new Error("Invalid Arguments");
  }
  const hasCredits = await checkHasCredits(accountId, deductCredits, type);
  if (!hasCredits) {
    console.log(
      `Account doesn't have enough credits id=${accountId}, operator=${deductCredits}, total_credit=${
        deductCredits || 0
      }`
    );
    throw new Error("Account doesn't have enough credits");
  }

  const tableParams: DynamoDB.DocumentClient.UpdateItemInput = {
    TableName: envTableNames.DYNAMODB_GLOBAL_ACCOUNT_SETTINGS,
    UpdateExpression: `set updated_at = :updated_at, ${type}_credits = ${type}_credits - :total_credit`,
    ExpressionAttributeValues: {
      ":updated_at": new Date().toISOString(),
      ":total_credit": deductCredits,
    },
    Key: {
      id: ACCOUNTS_TABLE_NAME,
      slug: accountId,
    },
  };

  await dynamodb.update(tableParams);
  // console.log(
  //   `Consumed credits id=${accountId}, total_credit=${deductCredits}`
  // );
};

export const updateBranches = async (
  accountSlug: string,
  branchCount: number,
  type: string
) => {
  const update_exp = `set active_fusion_branches = active_fusion_branches ${type} :branch_count, updated_at=:updated_at`;
  const now = new Date().toISOString();

  //Set As Processing
  const updateBranches = {
    TableName: envTableNames.DYNAMODB_GLOBAL_ACCOUNT_SETTINGS,
    Key: {
      id: ACCOUNTS_TABLE_NAME,
      slug: accountSlug,
    },
    UpdateExpression: update_exp,
    ExpressionAttributeValues: {
      ":branch_count": branchCount,
      ":updated_at": now,
    },
  };
  await dynamodb.update(updateBranches);
};

export const getAccountItem = async (accountId: string) => {
  const { Item } = await dynamodb.get({
    TableName: envTableNames.DYNAMODB_GLOBAL_ACCOUNT_SETTINGS,
    Key: {
      id: ACCOUNTS_TABLE_NAME,
      slug: accountId,
    },
  });

  if (!Item) {
    console.log(`Account doesn't exists against this id=${accountId}`);
    return null;
  }

  return Item as Account;
};

const getParentOperators = (
  operator: SessionOperator,
  sessionOperators: SessionOperator[],
  stopSlug: string
): SessionOperator[] => {
  // console.log("Get Parent Operators", {
  //   operator,
  //   sessionOperators,
  //   stopSlug,
  // });
  if (!operator.parent_operator_slug) {
    return [];
  }
  const parentOperator = find(sessionOperators, {
    operator_slug: operator.parent_operator_slug,
  });
  // console.log("Parent Operator", parentOperator);
  if (!parentOperator) {
    return [];
  }
  if (parentOperator.operator_slug === stopSlug) {
    return [parentOperator];
  }
  return [
    parentOperator,
    ...getParentOperators(parentOperator, sessionOperators, stopSlug),
  ];
};

export const getParentIterators = (
  operator: SessionOperator,
  sessionOperators: SessionOperator[],
  stopSlug: string
) => {
  // console.log("Get Parent Iterators", {
  //   operator,
  //   sessionOperators,
  //   stopSlug,
  // });
  const parentOperators = getParentOperators(
    operator,
    sessionOperators,
    stopSlug
  );
  return parentOperators.filter(
    (op) => op.app_module === FlowControlOperators.ArrayIterator
  );
};

export const parseRequestBody = (
  body: unknown,
  contentType: ThreePAppCommunication["type"]
) => {
  let headers: Record<string, string> = {};
  let requestBody: Record<string, unknown> | string | FormData = {};
  switch (contentType) {
    case "urlencoded":
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      requestBody = qs.stringify(body);
      break;
    case "multipart/form-data": {
      const formData = new FormData();
      const multipartBody = body as MultipartBody;
      if (multipartBody?.file) {
        if (multipartBody?.file?.options) {
          Object.entries(multipartBody.file.options).forEach(([key, value]) => {
            formData.append(key, value);
          });
        }

        if (multipartBody.file?.value) {
          // if (isBuffer(multipartBody.file?.value)) {
          //   console.log("is buffer");
          // }

          // if (isString(multipartBody.file?.value)) {
          //   console.log("is string");
          // }
          // console.log({ type: typeof multipartBody.file.value });
          const stream = Readable.from(multipartBody.file.value);

          formData.append("file", stream, "file.mp3");
        }
      }
      requestBody = formData;
      headers = { ...headers, ...formData.getHeaders() };
      break;
    }
    default:
      // headers["Content-Type"] = "application/json";
      requestBody = body as Record<string, unknown>;
  }

  return {
    headers,
    body: requestBody,
  };
};
