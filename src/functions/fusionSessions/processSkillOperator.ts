import middy from "@middy/core";
import { Handler } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import { get, pick } from "lodash";
import isString from "lodash/isString";
import moment from "moment";
import { OkPacket } from "mysql2";
import {
  ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
  ACCOUNT_JOB_SESSION_DATA_TABLE_NAME,
  ACCOUNT_JOB_SESSION_TABLE_NAME,
  ACCOUNT_SKILL_SESSION_TABLE_NAME,
  MEDIA_BUCKET_NAME,
  WEBSOCKET_URL,
  envTableNames,
} from "../../config";
import { FusionLambda, SkillModules } from "../../constants/3pApp";
import { ModuleType } from "../../enums/3pApp";
import { InvocationType } from "../../enums/lambda";
import { getUserSocketConnection } from "../../functions/websocket/helper";
import { emit } from "../../functions/websocket/util";
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
} from "../../helpers/fusion";
import {
  QueueItem,
  getExecutionQueue,
  updateQueueItem,
} from "../../helpers/fusion/executionQueue";
import { invokeLambda } from "../../helpers/lambda";
import mainDbInitializer from "../../middleware/mainDbInitializer";
import {
  Fusion,
  FusionLambdaEvent,
  FusionOperator,
  FusionOperatorLog,
  ProcessOperatorParams,
} from "../../types/Fusion";
import { JobSession } from "../../types/Job";
import {
  generateLog,
  getAccountItem,
  getSessionItem,
  sendFusionNotification,
  updateOperatorLogs,
  updateSession,
  updateSessionOperatorStatus,
  updateSessionVariables,
} from "../../util/3pModule";
import { getFusion, getIncomingOperators } from "../../util/fusion";
import { applyToValues, sleep } from "../../util/index";
import { SylarAction, SylarEvent } from "../websocket/sylar";
import { processUpdateDisplayAsync } from "./processUpdateDisplayAsync";

export const processSkillOperatorHandler: Handler<FusionLambdaEvent> = async (
  event
) => {
  // console.time("process-basic-system-operator-time");
  // console.log(
  //   "process basic system operators lambda hit: ",
  //   JSON.stringify(event, null, 2)
  // );

  const operatorLogs: FusionOperatorLog[] = [];

  try {
    await processSkillOperator({ ...event, operatorLogs });
  } catch (err) {
    console.log(
      "🚀 ~ file: processSkillOperator.ts:58 ~ constlambdaHandler:Handler<FusionLambdaEvent>= ~ err:",
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

  // console.timeEnd("process-basic-system-operator-time");
  // console.log("Memory: ", process.memoryUsage());
};

type SkillOperatorParams = {
  session_vars?: Record<string, unknown>;
  fields_data?: Record<string, unknown>[];
  question_type?: string;
  question?: string;
  options?: { value: string }[];
  job_slug?: string;
  html?: string;
  css?: string;
  js?: string;
  title?: string;
  note?: string;
  execution_type?: "sync" | "async";
  display_type?: "html" | "code" | "fusion";
  code_action?: "append" | "replace";
  code?: string;
  fusion_slug?: string;
  fusion_type?: "open_fusion" | "create_fusion";
  fusion_editor_action?: string;
};

export const processSkillOperator = async (event: ProcessOperatorParams) => {
  const {
    sessionSlug,
    appSlug,
    accountId,
    queueItem,
    appModuleSlug,
    responses: s3Responses,
    operatorLogs = [],
  } = event;
  console.log(
    "🚀 ~ file: processSkillOperator.ts:89 ~ processSkillOperator ~ queueItem:",
    JSON.stringify(queueItem, null, 2)
  );

  //Get The Session Data
  // console.log("Get Session Data");
  const session = await getSessionItem(sessionSlug, accountId);
  // console.log("Session Data: ", session);
  const { session_data: sessionData } = session || {};

  const {
    session_operators,
    user_id,
    session_variables = {},
  } = sessionData || {};

  const operatorIdx = session_operators.findIndex(
    (operator) => operator.operator_slug === queueItem.operator_id
  );
  // console.log("Operator Index: ", operatorIdx);
  const operator = session_operators[operatorIdx];
  // console.log("Operator: ", operator);

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

  // const {
  //   name: rawName,
  //   value: rawValue,
  //   variables: rawVariables,
  // } = operator.operator_input_settings || {};

  const prevCreateJobOperators = getIncomingOperators(
    operator,
    (sessionData?.session_operators as FusionOperator[]) || []
  ).filter((o) => o.app_module === SkillModules.CreateJob);

  const extraResponses = prevCreateJobOperators.map((op) => op.operator_slug);
  if (isString(queueItem.inputs.source)) {
    extraResponses.push(queueItem.inputs.source);
  }

  // console.log(
  //   "🚀 ~ file: processBasicSystemOperator.ts:146 ~ processBasicSystemOperator ~ extraResponses:",
  //   JSON.stringify(extraResponses, null, 2)
  // );
  const responses = await getPrevOperatorResponses(
    queueItem.inputs,
    s3Responses,
    extraResponses
  );
  // console.log(
  //   "🚀 ~ file: processBasicSystemOperator.ts:154 ~ processBasicSystemOperator ~ responses:",
  //   JSON.stringify(responses, null, 2)
  // );

  const gfmlFunctions = await getFunctions(appSlug, accountId);

  const options: ParseOptions = {
    body: responses,
    responses: { ...responses, session_variables },
    functions: gfmlFunctions,
  };
  // console.log(
  //   "🚀 ~ file: processBasicSystemOperator.ts:162 ~ processBasicSystemOperator ~ options:",
  //   JSON.stringify(options, null, 2)
  // );

  const inputExpressions = applyToValues(
    queueItem.inputs,
    parseTagsToExpression
  );
  console.log(
    "🚀 ~ file: processBasicSystemOperator.ts:168 ~ processBasicSystemOperator ~ inputExpressions:",
    JSON.stringify(inputExpressions, null, 2),
    JSON.stringify({ ...options, functions: undefined }, null, 2)
  );
  const parameters = await parseExpression<SkillOperatorParams>(
    inputExpressions,
    options
  );
  console.log(
    "🚀 ~ file: processBasicSystemOperator.ts:173 ~ processBasicSystemOperator ~ parameters:",
    JSON.stringify(parameters, null, 2)
  );

  operatorLogs.push(
    generateLog(`Operation ${(operationIdx || 0) + 1} Started`, "Success")
  );

  let response: any = {};
  const moduleType: string = ModuleType.Action;

  // console.log("Session Variables: ", session_variables);
  switch (operator.app_module) {
    case SkillModules.UpdateInputVariables: {
      const { session_vars } = parameters;
      if (session_vars) {
        response.sessionInitVars = Object.entries(
          (response.sessionInitVars as Record<string, unknown>) || {}
        ).reduce((acc, [key, value]) => {
          acc[key] = session_vars[key] ?? value;
          return acc;
        }, response.sessionInitVars as Record<string, unknown>);
        const executionQueue = await getExecutionQueue(sessionSlug);

        if (executionQueue?.length) {
          const updatedQueue = updateSessionVarsInExecutionQueue(
            executionQueue,
            session_vars
          );

          for (const item of updatedQueue) {
            await updateQueueItem(
              sessionSlug,
              item.slug,
              pick(item, ["input", "responses"])
            );
          }
        }
      }
      break;
    }
    case SkillModules.UpdateSkillUser: {
      const { fields_data } = parameters;
      if (fields_data) {
        const updatedVars = fields_data.reduce<Record<string, unknown>>(
          (acc, cur) => {
            if (cur.key === "other") {
              acc[`${cur.key_slug}`] = cur.value;
            } else {
              acc[`${cur.key}`] = cur.value;
            }

            return acc;
          },
          {}
        );

        responses.skill_user_variables = updatedVars;
        response = updatedVars;
        const executionQueue = await getExecutionQueue(sessionSlug);

        if (executionQueue?.length) {
          const updatedQueue = updateSessionVarsInExecutionQueue(
            executionQueue,
            updatedVars,
            "skill_user_variables"
          );
          for (const item of updatedQueue) {
            await updateQueueItem(
              sessionSlug,
              item.slug,
              pick(item, ["input", "responses"])
            );
          }
          await updateSession(
            accountId,
            sessionSlug,
            "SET #sessionData.#skillUserVars = :skillUserVars",
            {
              ":skillUserVars": updatedVars,
            },
            {
              "#sessionData": "session_data",
              "#skillUserVars": "skill_user_variables",
            },
            {
              putEvents: false,
            }
          );
        }
      }
      break;
    }
    case SkillModules.UpdateSkillSession: {
      const { fields_data } = parameters;
      if (fields_data) {
        const updatedVars = fields_data.reduce<Record<string, unknown>>(
          (acc, cur) => {
            if (cur.key === "other") {
              acc[`${cur.key_slug}`] = cur.value;
            } else {
              acc[`${cur.key}`] = cur.value;
            }

            return acc;
          },
          {}
        );

        responses.skill_session_variables = updatedVars;
        response = updatedVars;
        const executionQueue = await getExecutionQueue(sessionSlug);

        if (executionQueue?.length) {
          const updatedQueue = updateSessionVarsInExecutionQueue(
            executionQueue,
            updatedVars,
            "skill_session_variables"
          );
          for (const item of updatedQueue) {
            await updateQueueItem(
              sessionSlug,
              item.slug,
              pick(item, ["input", "responses"])
            );
          }
          await updateSession(
            accountId,
            sessionSlug,
            "SET #sessionData.#skillSessionVars = :skillSessionVars",
            {
              ":skillSessionVars": updatedVars,
            },
            {
              "#sessionData": "session_data",
              "#skillSessionVars": "skill_session_variables",
            },
            {
              putEvents: false,
            }
          );
        }
      }
      break;
    }
    case SkillModules.AskQuestion: {
      const { question_type, question, options } = parameters;

      const askQuestionParams = {
        TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_MESSAGES,
        Item: {
          id: `${accountId}:${sessionData.user_id}:${(
            get(responses, ["popup_variables", "chat_session_id"]) as string
          )
            ?.split(":")
            .pop()}`,
          slug: `${Date.now()}:AGENT`,
          created_at: `${Date.now()}`,
          is_open: 1,
          is_agent: true,
          meta_data: {
            type: "question",
            question_data: {
              question_type,
              question,
              options,
            },
            sessionData: {
              sessionSlug,
              accountId,
              operatorSlug: operator.operator_slug!,
              operationIdx,
              queueItemSlug: queueItem.slug,
              queueBranchId: sessionData.parallel_branch_execution
                ? queueItem.branch_id
                : undefined,
            },
          },
          is_deleted: 0,
        },
      };

      await dynamodb.put(askQuestionParams, 2);

      const userSocketConnections = await getUserSocketConnection(user_id);

      await emit(
        SylarAction.SYLAR_MESSAGES,
        {
          type: SylarEvent.MESSAGE,
          isResponseComplete: true,
          message: askQuestionParams.Item,
        },
        WEBSOCKET_URL,
        userSocketConnections,
        "sylar"
      ).catch((e) => {
        // handle error here
        console.error(e);
      });

      await updateSession(
        accountId,
        sessionSlug,
        "SET #isPaused = :isPaused",
        {
          ":isPaused": true,
        },
        {
          "#isPaused": "is_paused",
        }
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

      return;
    }
    case SkillModules.UpdateDisplay: {
      const {
        job_slug,
        html,
        css,
        js,
        execution_type = "async",
        display_type = "html",
        code_action = "append",
        code,
        fusion_slug,
        fusion_type,
        fusion_editor_action,
      } = parameters;

      const updateDisplayParams = {
        job_slug,
        html,
        css,
        js,
        accountId,
        userId: user_id,
        responses,
        display_type,
        code_action,
        code,
        fusion_slug,
        fusion_type,
        fusion_editor_action,
      };

      if (execution_type === "async") {
        await invokeLambda(
          FusionLambda.ProcessUpdateDisplayOperatorAsync,
          { ...updateDisplayParams, sessionSlug },
          InvocationType.Event
        );
      } else {
        const output = await processUpdateDisplayAsync(updateDisplayParams);

        if (display_type === "fusion") {
          if (fusion_type === "open_fusion" && fusion_slug) {
            const getOperatorEdgeConditions = (op: FusionOperator) => {
              const conditions = {
                rule_name: op.edge_data?.label,
                condition_sets: [] as {
                  lhs: string;
                  rhs: string;
                  comparison_type: string;
                }[],
              };

              for (const condition of op.edge_data?.condition_sets || []) {
                for (const condition_set of condition.condition_set || []) {
                  conditions.condition_sets.push({
                    lhs: condition_set.a,
                    rhs: condition_set.b,
                    comparison_type: condition_set.o,
                  });
                }
              }

              return conditions;
            };

            const getFusionSteps = (
              fusion?: Fusion,
              root?: FusionOperator,
              parent?: string
            ) => {
              if (!root || !fusion) {
                return [];
              }

              const steps = [
                {
                  step_id: root.operator_slug,
                  operator_name: root.operator_title,
                  operator_type: root.module_type,
                  parent_step: parent,
                  conditions: getOperatorEdgeConditions(root),
                  input_slots: root.operator_input_settings,
                },
              ];

              const childOperators =
                fusion.fusion_operators?.filter(
                  (op) => op.parent_operator_slug === root.operator_slug
                ) || [];

              for (const childOp of childOperators) {
                steps.push(
                  ...getFusionSteps(fusion, childOp, root.operator_slug)
                );
              }

              return steps;
            };
            const fusion = await getFusion(fusion_slug, accountId);

            response = {
              automation_flow: {
                steps: getFusionSteps(
                  fusion,
                  fusion?.fusion_operators?.find((op) => op.is_start_node)
                ),
              },
            };
            break;
          } else if (fusion_type === "create_fusion") {
            if (fusion_editor_action?.startsWith("createFusion")) {
              response = {
                fusion_slug: (output as Fusion)?.fusion_slug,
              };
              break;
            }
          }
        }
      }

      response = {
        html,
        css,
        js,
      };
      break;
    }
    case SkillModules.CreateJob: {
      const { title, note, html, js, css } = parameters;

      const account = await getAccountItem(accountId);
      if (!account?.database_name) {
        throw new Error(`Account ${accountId} does not have a database name`);
      }

      const connection = await getAuroraConnection(account.database_name);

      const insertObject = {
        account_id: accountId,
        user_id: user_id,
        related_skill_id: get(responses, ["popup_variables", "skill_id"]),
        title,
        skill_session_id: Number(
          get(responses, ["popup_variables", "skill_session_id"])
        ),
        start_date_time: moment.utc().format("YYYY-MM-DD HH:mm:ss"),
        status: "Awaiting Instruction",
        note,
      };

      const { columns, values } = Object.entries(insertObject).reduce<{
        columns: string[];
        values: string[];
      }>(
        (acc, [k, v]) => {
          acc.columns.push(`\`${k}\``);
          acc.values.push(`'${v}'`);
          return acc;
        },
        { columns: [], values: [] }
      );

      const [insertRes] = await connection.execute(
        `INSERT INTO \`${ACCOUNT_JOB_SESSION_TABLE_NAME}\` (${columns.join(
          ","
        )}) VALUES (${values.join(",")})`
      );

      const job_slug = (insertRes as OkPacket).insertId;

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
      const urls: Record<string, string> = {};
      if (html) {
        await s3
          .putObject({
            Bucket: MEDIA_BUCKET_NAME!,
            Key: htmlUrl,
            Body: html,
          })
          .promise();

        urls.html = htmlUrl;
      }

      if (css) {
        await s3
          .putObject({
            Bucket: MEDIA_BUCKET_NAME!,
            Key: cssUrl,
            Body: css,
          })
          .promise();

        urls.css = cssUrl;
      }

      if (js) {
        await s3
          .putObject({
            Bucket: MEDIA_BUCKET_NAME!,
            Key: jsUrl,
            Body: js,
          })
          .promise();

        urls.js = jsUrl;
      }

      const params: DynamoDB.DocumentClient.PutItemInput = {
        TableName: envTableNames.DYNAMODB_JOB_SESSION_DATA,
        Item: {
          id: `${accountId}:${ACCOUNT_JOB_SESSION_DATA_TABLE_NAME}`,
          slug: `${job_slug}`,
          session_data: urls,
          related_skill_id: get(responses, ["popup_variables", "skill_id"]),
          created_at: moment.utc().format(),
          updated_at: moment.utc().format(),
          is_active: 1,
          is_deleted: 0,
        },
      };

      await dynamodb.put(params);

      const userSocketConnections = await getUserSocketConnection(user_id);
      await emit(
        SylarAction.SYLAR_EVENT,
        {
          jobSession: {
            session_id: job_slug as unknown as number,
            status: "Awaiting Instruction",
            user_id,
            account_id: accountId,
            title,
            note,
            session_data: params.Item,
          } as Partial<JobSession>,
          type: SylarEvent.NEW_JOB_SESSION,
        },
        WEBSOCKET_URL,
        userSocketConnections,
        "sylar"
      ).catch((e) => {
        // handle error here
        console.error(e);
      });
      response = {
        job_id: job_slug,
        html,
        css,
        js,
        title,
        note,
      };
      break;
    }
    case SkillModules.ChangeSelectedDisplay: {
      const { job_slug } = parameters;

      const userSocketConnections = await getUserSocketConnection(user_id);

      await emit(
        SylarAction.SYLAR_EVENT,
        {
          type: SylarEvent.CHANGE_SELECTED_DISPLAY,
          data: {
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

      response = {};

      break;
    }
    case SkillModules.ExitSkill: {
      const account = await getAccountItem(accountId);
      if (!account?.database_name) {
        throw new Error(`Account ${accountId} does not have a database name`);
      }

      const skillSessionId = get(responses, [
        "popup_variables",
        "skill_session_id",
      ]);

      const chatSessionSlug = get(responses, [
        "popup_variables",
        "chat_session_id",
      ]);

      const connection = await getAuroraConnection(account.database_name);
      await connection.execute(
        `UPDATE ${ACCOUNT_SKILL_SESSION_TABLE_NAME} SET \`end_date_time\` = '${new Date()}', \`status\` = 'Closed', \`note\` = 'session closed by command end skill' WHERE \`session_id\` = '${skillSessionId}'`
      );

      await connection.execute(
        `UPDATE ${ACCOUNT_JOB_SESSION_TABLE_NAME} SET \`status\` = 'Cancelled' WHERE \`related_skill_id\` = '${session.fusion_slug}' AND \`status\` = 'Awaiting Instruction'`
      );

      const sylarMessageParams = {
        TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_MESSAGES,
        Item: {
          id: `${accountId}:${sessionData.user_id}:${(chatSessionSlug as string)
            ?.split(":")
            .pop()}`,
          slug: `${Date.now()}:SYLAR`,
          created_at: `${Date.now()}`,
          is_open: 1,
          by_sylar: true,
          chatgpt: true,
          meta_data: { message: "Stopping the skill" },
          is_deleted: 0,
        },
      };

      await dynamodb.put(sylarMessageParams);
      await dynamodb.update({
        TableName: envTableNames.DYNAMODB_ACCT_SYLAR_CHAT_SESSION,
        Key: {
          id: `${accountId}:${sessionData.user_id}`,
          slug: chatSessionSlug,
        },
        UpdateExpression:
          "SET #metadata.#activeSkill = :activeSkill, #metadata.#activeSkillSession = :activeSkillSession",
        ExpressionAttributeNames: {
          "#metadata": "meta_data",
          "#activeSkill": "active_skill",
          "#activeSkillSession": "active_skill_session",
        },
        ExpressionAttributeValues: {
          ":activeSkill": "none",
          ":activeSkillSession": "none",
        },
      });

      const userSocketConnections = await getUserSocketConnection(user_id);

      await emit(
        SylarAction.SYLAR_MESSAGES,
        {
          isResponseComplete: true,
          message: sylarMessageParams.Item,
          type: SylarEvent.MESSAGE,
        },
        WEBSOCKET_URL,
        userSocketConnections,
        "sylar"
      ).catch((e) => {
        // handle error here
        console.error(e);
      });

      response = {};

      break;
    }
    default:
      console.log("Invalid App Module: Skipping");
  }
  // console.log("updateSessionVariables: ", session_variables);
  await updateSessionVariables(sessionSlug, session_variables, accountId);
  // console.log(
  //   "🚀 ~ file: processBasicSystemOperator.ts:744 ~ processBasicSystemOperator ~ ress:",
  //   JSON.stringify(ress, null, 2)
  // );
  // console.log("updatedSessionVariables: ", session_variables);

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

const updateSessionVarsInExecutionQueue = (
  queue: QueueItem[],
  sessionVars: Record<string, unknown>,
  updateKey = "sessionInitVars"
): QueueItem[] => {
  return queue.map((q) => {
    const responses = Object.entries(q.responses?.[updateKey] || {}).reduce(
      (acc, [key, value]) => {
        acc[key] = sessionVars[key] ?? value;
        return acc;
      },
      (q.responses?.[updateKey] || {}) as Record<string, unknown>
    );

    return {
      ...q,
      responses,
      // branches: updateSessionVarsInExecutionQueue(
      //   q.branches || [],
      //   sessionVars,
      //   updateKey
      // ),
    } as QueueItem;
  });
};

type WaitForUserInputParams = {
  sessionSlug: string;
  accountId: string;
  operatorSlug: string;
  operationIdx: number;
};

const waitForUserInput = async (params: WaitForUserInputParams) => {
  const { sessionSlug, accountId, operationIdx, operatorSlug } = params;
  const waitStartTime = moment();
  let userInput: { message: string; uid: string } | null = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (moment().diff(waitStartTime, "minutes") > 5) {
      throw new Error(
        `Timed out waiting for user input for session ${sessionSlug}`
      );
    }
    const session = await getSessionItem(sessionSlug, accountId);
    // console.log(
    //   "🚀 ~ file: processSkillOperator.ts:843 ~ waitForUserInput ~ session:",
    //   JSON.stringify(session, null, 2)
    // );
    const messageResponse = get(session, [
      "session_data",
      "skill_responses",
      operatorSlug,
      "answer",
    ]);

    const uid = get(session, [
      "session_data",
      "skill_responses",
      operatorSlug,
      "uid",
    ]);

    userInput = {
      message: messageResponse,
      uid,
    };

    if (messageResponse && uid) {
      await updateSession(
        accountId,
        sessionSlug,
        "SET #sessionData.#skillResponses.#operatorSlug = :response",
        {
          ":response": {},
        },
        {
          "#sessionData": "session_data",
          "#skillResponses": "skill_responses",
          "#operatorSlug": operatorSlug,
        }
      );
      break;
    }

    await sleep(5000);
  }

  return userInput;
};

export const handler = middy()
  .use(mainDbInitializer())
  .handler(processSkillOperatorHandler);
