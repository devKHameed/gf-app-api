import middy from "@middy/core";
import { Handler } from "aws-lambda";
import { get } from "lodash";
import moment from "moment";
import { ModuleType } from "../../enums/3pApp";
import { parseExpression } from "../../helpers/3pExpression";
import {
  addOperatorOperations,
  finalizeOperator,
  getPrevOperatorResponses,
} from "../../helpers/fusion";
import mainDbInitializer from "../../middleware/mainDbInitializer";
import { FusionLambdaEvent } from "../../types";
import {
  getSessionItem,
  sendFusionNotification,
  updateSession,
  updateSessionOperatorStatus,
} from "../../util/3pModule";

export const processChartOperatorHandler: Handler<FusionLambdaEvent> = async (
  event
) => {
  // console.log(
  //   "Process Chart Operator lambda hit: ",
  //   JSON.stringify(event, null, 2)
  // );

  try {
    return await processChartOperator(event);
  } catch (err) {
    console.log(
      "🚀 ~ file: processChartOperator.ts:29 ~ constlambdaHandler:Handler<FusionLambdaEvent>= ~ err:",
      err
    );
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
  }
};

export const processChartOperator = async (event: FusionLambdaEvent) => {
  const {
    sessionSlug,
    accountId,
    responses: s3Responses,
    queueItem,
    appSlug,
  } = event;

  //Get The Session Data
  const session = await getSessionItem(sessionSlug, accountId);
  // console.log("Session Item: ", session);
  const { session_data: sessionData } = session || {};
  const { session_operators } = sessionData || {};

  const operatorIdx = session_operators.findIndex(
    (operator) => operator.operator_slug === queueItem.operator_id
  );
  // console.log("Operator Index: ", operatorIdx);
  const operator = session_operators[operatorIdx];
  // console.log("Operator: ", operator);

  const widget_data = operator.operator_input_settings || {};
  const isBar = session.session_data.fusion_type === "bar";
  const isPie = session.session_data.fusion_type === "pie";
  const isLine = session.session_data.fusion_type === "line";

  // console.log(
  //   "🚀 ~ file: processChartOperator.ts:27 ~ processChartOperator ~ widget_data:",
  //   JSON.stringify(widget_data, null, 2)
  // );

  // Consume Credit
  // console.log("Consume Credit");
  // await consumeCredits(accountId, 1);

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

  const responses = await getPrevOperatorResponses(widget_data, s3Responses, [
    "chart_inputs",
  ]);
  // console.log(
  //   "🚀 ~ file: processChartOperator.ts:81 ~ processChartOperator ~ responses:",
  //   JSON.stringify(responses, null, 2)
  // );

  try {
    let { chart_data: widgetDataResponse } = await parseExpression<{
      chart_data: Record<string, any>;
    }>(widget_data, {
      responses,
    });
    // console.log("Chart Data", JSON.stringify(widgetDataResponse, null, 2));
    if (isBar) {
      const { dataset, label_key, data_keys } = (widgetDataResponse ||
        {}) as any;
      widgetDataResponse = {
        labels:
          (dataset as any[])?.map?.((d) => ({ value: get(d, label_key) })) ||
          [],
        datasets:
          (data_keys as any[])?.map(({ value }: { value: string }) => ({
            label: value.split(".").pop(),
            data: (dataset as any[])?.map?.((d) => ({ value: get(d, value) })),
          })) || [],
      };
    }
    if (isPie) {
      const { dataset, label_key, data_keys } = (widgetDataResponse ||
        {}) as any;

      widgetDataResponse = {
        labels:
          (dataset as any[])?.map?.((d) => ({ value: get(d, label_key) })) ||
          [],
        datasets:
          (data_keys as any[])?.map(({ value }: { value: string }) => ({
            label: value.split(".").pop(),
            data: (dataset as any[])?.map?.((d) => ({ value: get(d, value) })),
          })) || [],
      };
    }
    if (isLine) {
      const { dataset, label_key, data_keys } = (widgetDataResponse ||
        {}) as any;

      widgetDataResponse = {
        labels:
          (data_keys as any[])?.map?.(({ value }: { value: string }) => ({
            value: value.split(".").pop(),
          })) || [],
        datasets:
          (dataset as any[])?.map((d) => ({
            label: get(d, label_key),
            data: (data_keys as any[])?.map?.(({ value }) => ({
              value: get(d, value),
            })),
          })) || [],
      };
    }
    // console.log(
    //   "🚀 ~ file: processChartOperator.ts:57 ~ processChartOperator ~ widgetDataResponse:",
    //   JSON.stringify(widgetDataResponse, null, 2)
    // );
    // return widgetDataResponse || {};

    await sendFusionNotification({
      ...session,
      is_chart_session: true,
      session_data: { ...session.session_data, payload: widgetDataResponse },
    });
    await finalizeOperator({
      accountId,
      sessionSlug,
      operator,
      operationIdx,
      appSlug,
      inputs: widget_data,
      outputs: widgetDataResponse,
      moduleType: ModuleType.Action,
      sessionData,
      queueItem,
      responses: s3Responses,
      operatorLogs: [],
      prevOperatorResponses: responses,
      operatorIdx,
    });
  } catch (e) {
    console.log("chart_data not found");
    // return widget_data;
    await sendFusionNotification({
      ...session,
      is_chart_session: true,
      session_data: { ...session.session_data, payload: widget_data },
    });
  }
};

export const handler = middy()
  .use(mainDbInitializer())
  .handler(processChartOperatorHandler);
