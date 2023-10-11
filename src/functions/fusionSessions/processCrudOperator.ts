import middy from "@middy/core";
import { Handler } from "aws-lambda";
import { cloneDeep, get, isArray, isEmpty, isPlainObject } from "lodash";
import moment from "moment";
import {
  ACCOUNT_DATASET_DESIGN_TABLE_NAME,
  ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
  envTableNames,
} from "../../config";
import { CrudOperator } from "../../constants/3pApp";
import { DocumentElementType } from "../../constants/dataset";
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
} from "../../helpers/fusion";
import mainDbInitializer from "../../middleware/mainDbInitializer";
import { DatasetDesign, ThreePAppModule } from "../../types";
import {
  FilterFieldType,
  FusionLambdaEvent,
  FusionOperatorLog,
  ProcessOperatorParams,
  SessionOperator,
} from "../../types/Fusion";
import {
  generateLog,
  getAppModule,
  getSessionItem,
  sendFusionNotification,
  updateOperatorLogs,
  updateSession,
  updateSessionOperatorStatus,
} from "../../util/3pModule";
import generateInsertSql, {
  formatValue,
  formatValueGet,
} from "../../util/dataset/generateInsertSql";
import generateUpdateSql from "../../util/dataset/generateUpdateSql";
import { applyToValues } from "../../util/index";

export const processCrudOperatorsHandler: Handler<FusionLambdaEvent> = async (
  event
) => {
  // console.time("process-crud-operator-time");
  // console.log(
  //   "process crud operators lambda hit: ",
  //   JSON.stringify(event, null, 2)
  // );

  // const connection = await getAuroraConnection("masteraccount");
  const operatorLogs: FusionOperatorLog[] = [];
  try {
    await processCrudOperators({ ...event, operatorLogs });
  } catch (err) {
    console.log(
      "🚀 ~ file: processCrudOperator.ts:58 ~ constlambdaHandler:Handler<FusionLambdaEvent>= ~ err:",
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

  // console.timeEnd("process-crud-operator-time");
  // console.log("Memory: ", process.memoryUsage());
};

const getOperatorSemanticDataKeyPath = (
  interfaces: ThreePAppModule["interface"],
  arrayIndex: number,
  prefix = ""
) => {
  for (const i of interfaces) {
    if (i.semantic === "file:data") {
      return `${prefix}.${i.name}`;
    }

    if (i.type === "collection") {
      const result = getOperatorSemanticDataKeyPath(
        (isPlainObject(i.spec)
          ? [i.spec]
          : i.spec) as ThreePAppModule["interface"],
        arrayIndex,
        `${prefix}.${i.name}`
      ) as string;

      if (result) {
        return result;
      }
    }

    if (i.type === "array") {
      const result = getOperatorSemanticDataKeyPath(
        (isPlainObject(i.spec)
          ? [i.spec]
          : i.spec) as ThreePAppModule["interface"],
        arrayIndex,
        `${prefix}.${i.name}[${arrayIndex}]`
      ) as string;

      if (result) {
        return result;
      }
    }
  }
};

const parseUploadFields = async (
  fields: Record<string, any>,
  s3Responses: FusionLambdaEvent["responses"],
  accountId: string,
  operators: SessionOperator[]
) => {
  if (
    fields.filename_buffer_semantic &&
    fields.filename_buffer_semantic !== "raw"
  ) {
    // TODO: handle s3 upload

    const value = s3Responses[fields.filename_buffer_semantic];
    const s3 = await getS3Client();

    const res = await s3
      .getObject({
        Bucket: process.env.MEDIA_BUCKET_NAME!,
        Key: value.responseUrl,
      })
      .promise();

    const data = JSON.parse(res.Body?.toString("utf-8") || "{}");
    let operatorResponse;
    if (value.index != null) {
      if ((value as any).is_loop_operator) {
        operatorResponse = data?.outputs?.[value.index];
      }
      operatorResponse = data?.outputs?.[value.index];
    } else {
      operatorResponse = data?.outputs;
    }

    if (!operatorResponse) {
      throw new Error(
        `Could not find operator response with index ${JSON.stringify(
          value,
          null,
          2
        )}`
      );
    }

    const op = operators.find(
      (o) => o.operator_slug === fields.filename_buffer_semantic
    );
    const appModule = await getAppModule(op?.app_module as string, accountId);

    const keyPath = getOperatorSemanticDataKeyPath(
      appModule.interface,
      value.index || 0
    );

    if (!keyPath) {
      throw new Error("Could not find key path for operator");
    }
    const fileData = get(operatorResponse, keyPath);
    if (!fileData) {
      throw new Error("Could not find file data for operator");
    }

    return fileData as unknown;
  }

  const parsedFields: Record<string, any> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (isPlainObject(value)) {
      parsedFields[key] = await parseUploadFields(
        value as Record<string, any>,
        s3Responses,
        accountId,
        operators
      );
    } else if (isArray(value)) {
      const arrayParsed: unknown[] = [];
      for (const item of value) {
        const parsed = await parseUploadFields(
          item as Record<string, any>,
          s3Responses,
          accountId,
          operators
        );
        arrayParsed.push(parsed);
      }
      parsedFields[key] = arrayParsed;
    }
  }

  return parsedFields;
};

export const processCrudOperators = async (event: ProcessOperatorParams) => {
  const {
    sessionSlug,
    appSlug,
    accountId,
    queueItem,
    appModuleSlug,
    responses: s3Responses,
    operatorLogs = [],
  } = event;

  const bodyData: ParseOptions["body"] = {};

  //Get The Session Data
  // console.log("Get Session Data");
  const session = await getSessionItem(sessionSlug, accountId);
  // console.log("Session Data: ", session);
  const { session_data } = session || {};

  const {
    session_operators,
    aurora_db_name,
    session_variables = {},
  } = session_data;
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

  const responses = await getPrevOperatorResponses(
    queueItem.inputs,
    cloneDeep(s3Responses)
  );

  const functions = await getFunctions(appSlug, accountId);
  const options: ParseOptions = {
    body: bodyData,
    responses: { ...responses, session_variables },
    functions,
  };
  // console.log("Options: ", options);

  const inputExpressions = applyToValues(
    queueItem.inputs,
    parseTagsToExpression
  );
  // console.log(
  //   "🚀 ~ file: processCrudOperator.ts:200 ~ processCrudOperators ~ inputExpressions:",
  //   JSON.stringify(inputExpressions, null, 2),
  //   JSON.stringify({ ...options, functions: undefined }, null, 2)
  // );
  const parameters = await parseExpression<{
    document_slug: string;
    dataset_title: string;
    record_slug: string;
    fields: unknown;
    tag_value: string;
    gsi_slug: string;
    partition_key_value: string;
    sort_key_value: string;
    condition_sets: FilterFieldType[];
    limit_by?: {
      field?: string;
      limit?: number;
      type?: "cumulative_sum" | "record_count" | "none";
    };
    order_by?: {
      field?: string;
      order?: "asc" | "desc";
    };
  }>(inputExpressions, options);
  // console.log(
  //   "🚀 ~ file: processCrudOperator.ts:202 ~ processCrudOperators ~ parameters:",
  //   JSON.stringify(parameters, null, 2)
  // );

  operatorLogs.push(
    generateLog(`Operation ${(operationIdx || 0) + 1} Started`, "Success")
  );

  const {
    document_slug: tableId,
    record_slug: itemSlug,
    fields,
    condition_sets,
  } = parameters;

  // console.log("Fields: ", fields);

  const params = {
    tableId,
    operatorLogs,
    fields,
    sessionSlug,
    operatorIdx,
    accountId,
    auroraDbName: aurora_db_name,
    conditionSets: condition_sets,
  };
  // console.log(
  //   "🚀 ~ file: processCrudOperator.ts:170 ~ processCrudOperators ~ params:",
  //   JSON.stringify(params, null, 2)
  // );
  let response;
  try {
    if (operator.app_module === CrudOperator.Create) {
      // console.log("Create Document");
      // const parsedFields = await parseUploadFields(
      //   params.fields as Record<string, any>,
      //   s3Responses,
      //   accountId,
      //   session_operators
      // );
      response = await createDocument({
        ...params,
        accountId: accountId,
        fields: params.fields as Record<string, unknown>,
        dataset_title: parameters.dataset_title,
      });
    }
    if (operator.app_module === CrudOperator.Read) {
      // console.log("Read Document");
      response = await getDocuments({
        ...params,
        fields: params.fields as string[],
        limit_by: parameters.limit_by,
        order_by: parameters.order_by,
      }); //extras
    }
    if (operator.app_module === CrudOperator.ReadOne) {
      // console.log("Get Document");
      response = await getDocument({
        ...params,
        recordSlug: itemSlug,
        fields: params.fields as string[],
      });
    }
    if (operator.app_module === CrudOperator.Update) {
      response = await updateDocument({
        ...params,
        recordSlug: itemSlug,
        fields: params.fields as Record<string, unknown>,
        dataset_title: parameters.dataset_title,
      });
    }
    if (operator.app_module === CrudOperator.Delete) {
      // console.log("Read Document");
      response = await deleteDocument({
        ...params,
        recordSlug: itemSlug,
      }); //extras
    }
  } catch (e) {
    console.log(e);
    const logs = [...params.operatorLogs];
    logs.push(generateLog("Operation", "Failed", { reason: e }));
    await updateOperatorLogs(
      params.sessionSlug,
      operatorIdx,
      "Failed",
      logs,
      accountId
    );

    throw e;
  }

  await finalizeOperator({
    accountId,
    sessionSlug,
    operator,
    operationIdx,
    appSlug,
    inputs: parameters,
    outputs: response,
    moduleType: ModuleType.Action,
    sessionData: session_data,
    queueItem,
    responses: s3Responses,
    operatorLogs,
    prevOperatorResponses: responses,
    operatorIdx,
  });
};

type CrudOptions = {
  tableId: string;
  recordSlug: string;
  sessionSlug: string;
  operatorLogs: FusionOperatorLog[];
  operatorIdx: number;
  accountId: string;
  auroraDbName?: string;
  conditionSets?: FilterFieldType[];
};

const getDatasetDesign = async (accountId: string, designSlug: string) => {
  const { Item } = await dynamodb.get({
    TableName: envTableNames.DYNAMODB_ACCT_DATASET_DESIGN,
    Key: {
      id: `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`,
      slug: designSlug,
    },
  });

  return Item as DatasetDesign;
};

const updateDocument = async ({
  tableId,
  recordSlug,
  fields: rawFields = {},
  sessionSlug,
  operatorLogs,
  operatorIdx,
  accountId,
  auroraDbName,
  dataset_title,
}: Omit<CrudOptions, "tagValue"> & {
  fields: Record<string, unknown>;
  dataset_title: string;
}) => {
  // console.log(
  //   "🚀 ~ file: processCrudOperator.ts:350 ~ auroraDbName:",
  //   auroraDbName
  // );
  const logs = [...operatorLogs];
  const fields = Object.entries(rawFields).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      if (value) {
        acc[key] = value;
      }

      return acc;
    },
    {}
  );

  const datasetDesign = await getDatasetDesign(accountId, tableId);

  // const auroraEnabled = ["sql", "both"].includes(datasetDesign?.engine);

  if (datasetDesign.sql_table_name && auroraDbName) {
    // console.log(
    //   "🚀 ~ file: processCrudOperator.ts:368 ~ datasetDesign.sql_table_name:",
    //   datasetDesign.sql_table_name
    // );
    if (!isEmpty(fields)) {
      const connection = await getAuroraConnection(auroraDbName);

      const sql = await generateUpdateSql(
        datasetDesign.sql_table_name,
        { ...fields },
        (datasetDesign?.fields?.fields as {
          slug: string;
          type: `${DocumentElementType}`;
        }[]) || [],
        `id = '${recordSlug}'`,
        accountId,
        {
          title: dataset_title,
        }
      );
      console.log("🚀 ~ file: processCrudOperator.ts:565 ~ sql:", sql);

      const sqlRes = await connection.execute(sql);
      console.log(
        "🚀 ~ file: processCrudOperator.ts:644 ~ sqlRes:",
        JSON.stringify(sqlRes, null, 2)
      );
    }

    const updatedItem = { id: recordSlug, title: dataset_title, ...fields };
    logs.push(
      generateLog("Results Updated", "Success", { updatedItem: updatedItem })
    );

    await updateOperatorLogs(
      sessionSlug,
      operatorIdx,
      "Complete",
      logs,
      accountId
    );
    return { data: updatedItem };
  } else {
    throw new Error(
      `Invalid Data: ${JSON.stringify({
        // auroraEnabled,
        sql_table_name: datasetDesign.sql_table_name,
        auroraDbName,
      })}`
    );
  }
};

const getDocuments = async ({
  tableId,
  operatorLogs,
  fields = [],
  sessionSlug,
  operatorIdx,
  accountId,
  auroraDbName,
  conditionSets = [],
  limit_by,
  order_by,
}: Omit<CrudOptions, "recordSlug" | "tagValue"> & {
  fields: string[];
  limit_by?: {
    field?: string;
    limit?: number;
    type?: "cumulative_sum" | "record_count" | "none";
  };
  order_by?: {
    field?: string;
    order?: "asc" | "desc";
  };
}) => {
  // console.log(
  //   "🚀 ~ file: processCrudOperator.ts:696 ~ conditionSets:",
  //   JSON.stringify(conditionSets, null, 2)
  // );
  const logs = [...operatorLogs];

  const datasetDesign = await getDatasetDesign(accountId, tableId);
  console.log(
    "🚀 ~ file: processCrudOperator.ts:439 ~ datasetDesign:",
    JSON.stringify(datasetDesign, null, 2)
  );

  if (datasetDesign.sql_table_name && auroraDbName) {
    const connection = await getAuroraConnection(auroraDbName);
    const filteredFields =
      fields?.filter(
        (f) => !!datasetDesign.fields?.fields?.some((df) => df.slug === f)
      ) || [];
    const sqlFields = ["id", ...(filteredFields?.map((f) => f.trim()) ?? [])]
      .map((f) => `m.\`${f}\``)
      .join(",");
    const finalFields = filteredFields.length > 0 ? sqlFields : "m.*";
    let limitPart = "";
    let tableSlot = datasetDesign.sql_table_name;
    let cumulativeSumWhereClause = "";

    if (limit_by?.type === "record_count") {
      limitPart = ` LIMIT ${Number(limit_by.limit)}`;
    } else if (limit_by?.type === "cumulative_sum") {
      let orderBy = "";

      if (order_by?.field) {
        if (order_by.field === "rand") {
          orderBy = " ORDER BY RAND()";
        } else if (order_by?.field !== "none") {
          orderBy = ` ORDER BY t.\`${order_by.field}\``;
        }

        if (orderBy) {
          orderBy += ` ${order_by.order || "asc"}`;
        }
      }

      tableSlot = `(SELECT 
        t.*,  
        @cumulative_sum := IF(@stop_flag=0, @cumulative_sum + t.\`${limit_by.field}\`, @cumulative_sum) AS cumulativeSum,
        @stop_flag := IF(@cumulative_sum > ${limit_by.limit}, 1, @stop_flag) AS dummy
    FROM ${datasetDesign.sql_table_name} t 
    CROSS JOIN (SELECT @cumulative_sum := 0, @stop_flag := 0) AS init${orderBy})`;
      cumulativeSumWhereClause = ` AND cumulativeSum <= ${limit_by.limit}`;
    }

    let sqlQuery = `SELECT ${finalFields} FROM ${tableSlot} AS m WHERE m.is_deleted = 0`;

    const filtered =
      conditionSets?.reduce<FilterFieldType[]>((acc, cur) => {
        const sets = cur.condition_set.filter((c) => c.a && c.b && c.o);
        if (sets.length > 0) {
          cur.condition_set = sets;
          acc.push(cur);
        }

        return acc;
      }, []) || [];
    console.log(
      "🚀 ~ file: processCrudOperator.ts:608 ~ filtered:",
      JSON.stringify(filtered, null, 2)
    );

    if (filtered.length > 0) {
      sqlQuery += ` AND ${filtered
        .map(
          (sets) =>
            `${sets.condition_set
              .map(
                (set) =>
                  `m.\`${set.a.trim()}\` ${set.o} ${formatValueGet(
                    set.b,
                    datasetDesign.fields?.fields?.find((f) => f.slug === set.a)
                      ?.type
                  )}`
              )
              .join(" AND ")}`
        )
        .join(" OR ")}`;
    }

    if (cumulativeSumWhereClause) {
      sqlQuery += cumulativeSumWhereClause;
    }

    if (limit_by?.type !== "cumulative_sum") {
      if (order_by?.field) {
        if (order_by.field === "rand") {
          sqlQuery += ` ORDER BY RAND() ${order_by.order || "asc"}`;
        } else if (order_by?.field !== "none") {
          sqlQuery += ` ORDER BY m.\`${order_by.field}\` ${
            order_by.order || "asc"
          }`;
        } else {
          sqlQuery += " ORDER BY m.id DESC";
        }
      } else {
        sqlQuery += " ORDER BY m.id DESC";
      }
    }

    if (limitPart) {
      sqlQuery += limitPart;
    }

    console.log("🚀 ~ file: processCrudOperator.ts:641 ~ sqlQuery:", sqlQuery);
    const splRes = await connection.execute(sqlQuery);

    const Items = splRes[0] as unknown[];
    console.log("🚀 ~ file: processCrudOperator.ts:644 ~ sqlRes:", Items);
    if (Items.length === 0) {
      logs.push(generateLog("No Read Items", "Warning", {}));
    }

    await updateOperatorLogs(
      sessionSlug,
      operatorIdx,
      "Complete",
      logs,
      accountId
    );
    return {
      data: Items,
      total_records: Items.length,
    };
  } else {
    throw new Error(
      `Invalid Data: ${JSON.stringify({
        // auroraEnabled,
        sql_table_name: datasetDesign.sql_table_name,
        auroraDbName,
      })}`
    );
  }
};

const getDocument = async ({
  tableId,
  recordSlug,
  operatorLogs,
  fields = [],
  sessionSlug,
  operatorIdx,
  accountId,
  auroraDbName,
  conditionSets = [],
}: Omit<CrudOptions, "tagValue"> & { fields: string[] }) => {
  const logs = [...operatorLogs];

  console.log(
    "🚀 ~ file: processCrudOperator.ts:726 ~ accountId, tableId:",
    fields
  );
  const datasetDesign = await getDatasetDesign(accountId, tableId);

  if (datasetDesign.sql_table_name && auroraDbName) {
    const connection = await getAuroraConnection(auroraDbName);
    const sqlFields = ["id", ...(fields?.map((f) => f.trim()) ?? [])]
      .map((f) => `\`${f}\``)
      .join(",");
    const finalFields = fields.length > 0 ? sqlFields : "*";
    let sqlQuery = `SELECT ${finalFields} FROM ${datasetDesign.sql_table_name} WHERE id = '${recordSlug}' AND is_deleted = 0`;

    const filtered =
      conditionSets?.reduce<FilterFieldType[]>((acc, cur) => {
        const sets = cur.condition_set.filter((c) => c.a && c.b && c.o);
        if (sets.length > 0) {
          cur.condition_set = sets;
          acc.push(cur);
        }

        return acc;
      }, []) || [];
    if (filtered.length > 0) {
      sqlQuery += ` AND (${conditionSets
        .map(
          (sets) =>
            `(${sets.condition_set
              .map(
                (set) =>
                  `\`${set.a}\` ${set.o} ${formatValue(
                    set.b,
                    datasetDesign.fields?.fields?.find((f) => f.slug === set.a)
                      ?.type
                  )}`
              )
              .join(" AND ")})`
        )
        .join(" OR ")})`;
    }

    console.log("🚀 ~ file: processCrudOperator.ts:641 ~ sqlQuery:", sqlQuery);
    const splRes = await connection.execute(sqlQuery);
    const [item] = splRes[0] as Record<string, unknown>[];
    console.log("🚀 ~ file: processCrudOperator.ts:539 ~ item:", item);

    if (!item || item.is_deleted) {
      logs.push(generateLog("No Read Item", "Warning", {}));
      return { data: null };
    }

    await updateOperatorLogs(
      sessionSlug,
      operatorIdx,
      "Complete",
      logs,
      accountId
    );
    return { data: item };
  } else {
    throw new Error(
      `Invalid Data: ${JSON.stringify({
        // auroraEnabled,
        sql_table_name: datasetDesign.sql_table_name,
        auroraDbName,
      })}`
    );
  }
};

const deleteDocument = async ({
  tableId,
  recordSlug,
  operatorLogs,
  sessionSlug,
  operatorIdx,
  accountId,
  auroraDbName,
}: Omit<CrudOptions, "tagValue">) => {
  const logs = [...operatorLogs];

  const datasetDesign = await getDatasetDesign(accountId, tableId);

  if (datasetDesign.sql_table_name && auroraDbName) {
    const connection = await getAuroraConnection(auroraDbName);

    const sqlQuery = `UPDATE ${datasetDesign.sql_table_name} SET is_deleted = 1 WHERE id = '${recordSlug}'`;

    console.log("🚀 ~ file: processCrudOperator.ts:641 ~ sqlQuery:", sqlQuery);
    const splRes = await connection.execute(sqlQuery);
    console.log("🚀 ~ file: processCrudOperator.ts:862 ~ splRes:", splRes);

    await updateOperatorLogs(
      sessionSlug,
      operatorIdx,
      "Complete",
      logs,
      accountId
    );
    return {};
  } else {
    throw new Error(
      `Invalid Data: ${JSON.stringify({
        // auroraEnabled,
        sql_table_name: datasetDesign.sql_table_name,
        auroraDbName,
      })}`
    );
  }
};

const createDocument = async ({
  tableId,
  accountId,
  fields,
  sessionSlug,
  operatorLogs,
  operatorIdx,
  auroraDbName,
  dataset_title,
}: Omit<CrudOptions, "recordSlug" | "tagValue"> & {
  fields: Record<string, unknown>;
  accountId: string;
  dataset_title: string;
}) => {
  const logs = [...operatorLogs];
  // const document_slug = `false:${tableId}:${uuidv4()}`;
  const document_title = dataset_title || "New Document";

  const dynamoItem = {
    // id: `${accountId}:${ACCOUNT_DATASETS_TABLE_NAME}`,
    title: document_title,
    // id: document_slug,
    // dataset_title_type: `false:${tableId}:${document_title}`,
    dataset_type_slug: tableId,
    fields,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_active: 1,
    is_deleted: 0,
  };

  const datasetDesign = await getDatasetDesign(accountId, tableId);
  // const auroraEnabled = ["sql", "both"].includes(datasetDesign?.engine);

  logs.push(
    generateLog("Create Object Created", "Success", {
      tableParams: dynamoItem,
    })
  );

  // console.log("creating document: ", dynamoItem);

  if (datasetDesign.sql_table_name && auroraDbName) {
    const connection = await getAuroraConnection(auroraDbName);

    const sql = await generateInsertSql(
      datasetDesign.sql_table_name,
      fields,
      (datasetDesign?.fields?.fields as {
        slug: string;
        type: `${DocumentElementType}`;
      }[]) || [],
      {
        dataset_type_slug: dynamoItem.dataset_type_slug,
        title: dynamoItem.title,
      },
      accountId
    );

    console.log("🚀 ~ file: processCrudOperator.ts:641 ~ sql:", sql);
    const res = await connection.execute(sql);
    console.log(
      "🚀 ~ file: processCrudOperator.ts:828 ~ res:",
      (res[0] as any)?.insertId
    );

    await updateOperatorLogs(
      sessionSlug,
      operatorIdx,
      "Complete",
      logs,
      accountId
    );
    return { data: { id: (res[0] as any)?.insertId, title: dataset_title } };
  } else {
    throw new Error(
      `Invalid Data: ${JSON.stringify({
        // auroraEnabled,
        sql_table_name: datasetDesign.sql_table_name,
        auroraDbName,
      })}`
    );
  }
};

export const handler = middy()
  .use(mainDbInitializer())
  .handler(processCrudOperatorsHandler);
