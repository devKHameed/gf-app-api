/* eslint-disable @typescript-eslint/no-unsafe-return */
import { aws4Interceptor } from "aws4-axios";
import axios, { AxiosError, AxiosRequestConfig, Method } from "axios";
import _, { isString } from "lodash";
import moment from "moment";
import {
  CommunicationTrigger,
  GFMLFunction,
  MappableParameter,
  ThreePApp,
  ThreePAppBaseStructure,
  ThreePAppCommunication,
  ThreePAppModule,
} from "types/Fusion/3pApp";
import xml2js from "xml2js";
import { REGION, envTableNames } from "../../config";
import { ModuleType } from "../../enums/3pApp";
import { FusionOperatorLog, SessionOperator } from "../../types/Fusion";
import { generateLog, parseRequestBody } from "../../util/3pModule";
import { getFusion } from "../../util/fusion";
import { isValidUrl } from "../../util/index";
import { ParseOptions, parseExpression } from "../3pExpression";
import { dynamodb } from "../db";

const processParameter = (parameters: MappableParameter[] = []) => {
  const parsedParameters: MappableParameter[] = [];

  for (const parameter of parameters) {
    if (typeof parameter === "string") {
      // TODO: figure out how to handle rpc parameters
    } else if (parameter.nested) {
      if (_.isArray(parameter.nested)) {
        parsedParameters.push(...processParameter(parameter.nested));
      } else if (_.isObject(parameter.nested)) {
        parsedParameters.push(...processParameter([parameter.nested]));
      } else if (typeof parameter.nested === "string") {
        // TODO: figure out how to handle rpc parameters
      }
    } else {
      parsedParameters.push(parameter);
    }
  }

  return parsedParameters;
};

export const executeModules = async (config: {
  module: Partial<ThreePAppModule> & {
    communication: ThreePAppModule["communication"];
  };
  app: ThreePApp;
  operatorOutputs?: Record<string, unknown>;
  bodyData: Record<string, unknown>;
  appSlug: string;
  gfmlFunctions: GFMLFunction[];
  pushToLogs?: (log: FusionOperatorLog) => void;
  accountId: string;
  triggerOperator?: SessionOperator;
  fusionSlug?: string;
  operatorIdx?: number;
  parseResponse?: boolean;
  epoch?: boolean;
  isGlobal?: boolean;
}) => {
  const {
    module,
    app,
    operatorOutputs = {},
    bodyData,
    appSlug,
    gfmlFunctions,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    pushToLogs = () => {},
    accountId,
    triggerOperator,
    operatorIdx,
    fusionSlug,
    parseResponse = true,
    epoch = false,
    isGlobal = false,
  } = config;
  // console.log("Execute Modules: ", {
  //   module,
  //   app,
  //   operatorOutputs,
  //   bodyData,
  //   gfmlFunctions,
  //   appSlug,
  // });
  const responses: unknown[] = [];
  const communications: ThreePAppCommunication[] = _.isArray(
    module.communication
  )
    ? module.communication
    : [module.communication];
  console.log("communications ", JSON.stringify(communications));
  const mappableParameters = processParameter(module.mappable_parameters);
  let options: ParseOptions = {
    body: _.cloneDeep(bodyData),
    responses: operatorOutputs,
    // app: appSlug,
    // functions: gfmlFunctions,
    mappableParameters,
  };
  gfmlFunctions.length > 0
    ? (options.functions = gfmlFunctions)
    : (options.app = appSlug);
  // eslint-disable-next-line prefer-const
  let {
    headers = {},
    // eslint-disable-next-line prefer-const
    baseUrl,
    // eslint-disable-next-line prefer-const
    aws,
  } = (await parseExpression<ThreePAppBaseStructure>(
    app.base_structure,
    options
  ).catch((e) => {
    console.log("app_item gfml failed", e);
  })) || {};
  console.log("🚀 ~ file: index.ts:109 ~ headers:", headers);
  console.log("App Item Parsed: ", { app, headers, baseUrl });
  for (const communication of communications) {
    // console.log("executing communication: ", communication);
    if (!communication) continue;
    const { response: responseObject } = communication;

    const temp = await parseExpression<Record<string, unknown>>(
      communication.temp,
      options
    ).catch((e) => {
      console.log("temp gfml failed", e);
    });
    // console.log("temp: ", temp);
    options = temp ? updateTemp(temp, options) : options;
    // console.log("options after temp application: ", options);
    const condition = await parseExpression(
      communication.condition != null ? communication.condition : true,
      options
    ).catch((e) => console.log("condition gfml failed", e));

    // console.log("condition: ", condition);

    if (!condition) {
      continue;
    }
    const method =
      (await parseExpression<Method>(communication.method, options).catch((e) =>
        console.log("method gfml failed", e)
      )) || "GET";
    // console.log("method: ", method);
    const url = await parseExpression<string>(
      communication.url || "",
      options
    ).catch((e) => console.log("url gfml failed", e));
    // console.log("url: ", url);
    const qs = await parseExpression<Record<string, unknown>>(
      communication.qs || {},
      options
    ).catch((e) => console.log("qs gfml failed", e));
    qs &&
      Object.keys(qs).forEach((key) => {
        //Skip Empty Keys
        if (qs[key] === "") {
          delete qs[key];
        }
      });
    // console.log("qs: ", qs);
    const localHeaders = await parseExpression<Record<string, string>>(
      communication.headers || {},
      options
    ).catch(() => console.log("headers gfml failed"));
    // console.log("localHeaders: ", localHeaders);
    const body = await parseExpression<ThreePAppCommunication["body"]>(
      communication.body,
      options
    ).catch(() => console.log("request gfml failed"));
    // console.log("body: ", body);

    let axiosPayload: AxiosRequestConfig = {};
    pushToLogs(
      generateLog("API Request Endpoint", "Success", {
        url,
      })
    );
    if (url) {
      const requestUrl = isValidUrl(url) ? url : `${baseUrl}${url}`;
      // console.log("requestUrl: ", requestUrl);
      if (!isValidUrl(requestUrl)) {
        console.log("Invalid URL");
        pushToLogs(generateLog("Invalid Request URL", "Failed", {}));
        continue;
      }
      const parseBody = parseRequestBody(body, communication.type);
      const requestBody = parseBody.body;
      headers = {
        ...headers,
        ...parseBody.headers,
      };
      // console.log("🚀 ~ file: index.ts:190 ~ headers:", headers);

      axiosPayload = {
        url: requestUrl,
        method: method,
        headers: { ...headers, ...localHeaders },
        params: qs || {},
      };
      // console.log("🚀 ~ file: index.ts:196 ~ axiosPayload:", axiosPayload);
      // check if the content type is defined in token object and alter code according to that
      // console.log("axios_payload: ", axiosPayload);
      if (method.toLowerCase() !== "get") {
        axiosPayload.data = requestBody;
        // console.log("applied data to payload", axiosPayload);
      }

      console.log("🚀 ~ file: index.ts:200 ~ axiosPayload", axiosPayload);
      let response: any;
      console.log("🚀 ~ file: index.ts:218 ~ aws:", aws);
      if (!aws?.key || !aws?.secret) {
        if (responseObject?.type === "binary") {
          axiosPayload.responseType = "arraybuffer";
        }
        console.log(
          "🚀 ~ file: index.ts:213 ~ axiosPayload:",
          JSON.stringify(axiosPayload, null, 2)
        );
        pushToLogs(
          generateLog("API Request Data", "Success", {
            request: axiosPayload,
          })
        );
        response = await axios.request(axiosPayload).catch((e: AxiosError) => {
          console.log(
            "Axios Request Error",
            e,
            // e.toJSON(),
            JSON.stringify(e.response?.data || "{}", null, 2)
          );
          pushToLogs(
            generateLog(e.message, "Failed", {
              request: axiosPayload,
              response: e,
              extra: e.response?.data,
            })
          );
        });
      } else {
        const credentials = {
          accessKeyId: communication.aws?.key || aws.key,
          secretAccessKey: communication.aws?.secret || aws.secret,
        };
        console.log("🚀 ~ file: index.ts:247 ~ credentials:", credentials);

        const client = axios.create();

        const apiUrl = new URL(requestUrl);
        console.log("🚀 ~ file: index.ts:252 ~ apiUrl:", apiUrl);
        let service = apiUrl.host.split(".")[0];
        console.log("🚀 ~ file: index.ts:254 ~ service:", service);
        if (service === "mturk-requester-sandbox") {
          service = "mturk-requester";
        }
        const interceptor = aws4Interceptor({
          options: {
            region: communication.aws?.region || aws.region || REGION,
            service,
          },
          credentials,
        });
        console.log("🚀 ~ file: index.ts:265 ~ interceptor:", interceptor);

        client.interceptors.request.use(interceptor);
        response = await client({
          ...axiosPayload,
          headers: {
            ...axiosPayload.headers,
            // "Content-Type": "application/x-amz-json-1.1",
          },
        }).catch((e: AxiosError) => {
          console.log(
            "Axios Request Error",
            e,
            // e.toJSON(),
            JSON.stringify(e.response?.data || "{}", null, 2)
          );
          pushToLogs(
            generateLog(e.message, "Failed", {
              request: axiosPayload,
              // response: e.toJSON(),
              extra: e.response?.data,
            })
          );
          throw e;
        });
      }

      if (!response) {
        continue;
      }

      if (!response.data) {
        // console.log("No Response Body");
        pushToLogs(
          generateLog("Undefined API response", "Failed", axiosPayload)
        );
        continue;
      }
      // console.log(typeof response.data, isBuffer(response.data));
      console.log("response: ", response.data);
      response.data = await parseResponseData(
        response.data,
        responseObject?.type
      );
      _.set(options, "body.body", response.data);
      // console.log(
      //   "options after response_body application: ",
      //   JSON.stringify(options, null, 2)
      // );

      if (!parseResponse) {
        responses.push(response.data);
        continue;
      }
    }

    const respTemp = await parseExpression(responseObject?.temp, options).catch(
      () => console.log("resp temp not found")
    );
    // console.log("resp_temp: ", respTemp);
    if (respTemp) {
      options = updateTemp(respTemp as Record<string, unknown>, options);
      // console.log("options after resp_temp application: ", options);
    }

    // console.log("options before parse_response: ", options);
    const operatorResponse = await parseResponseConfig({
      responseObject,
      appSlug,
      options: _.cloneDeep(options),
      app,
      pushToLogs,
      accountId,
      triggerOperator,
      fusionSlug,
      operatorIdx,
      appModule: module,
      epoch,
      isGlobal,
    });
    console.log(
      "operatorResponse: ",
      JSON.stringify(operatorResponse, null, 2)
    );

    //Iterate Payload For Axios

    if (operatorResponse) {
      pushToLogs(
        generateLog("API response", "Success", {
          ...axiosPayload,
          body: operatorResponse,
          headers: undefined,
        })
      );
      responses.push(operatorResponse);
    } else {
      pushToLogs(
        generateLog("Operator response not defined", "Warning", axiosPayload)
      );
    }
  }
  return responses;
};

const parseResponseData = async (data: any, type?: string) => {
  if (type === "xml") {
    if (!isString(data)) {
      return data;
    }
    const xmlParse = new xml2js.Parser();
    const parsedObject = await xmlParse.parseStringPromise(data);
    return parsedObject;
  } else if (type === "binary") {
    const buffer = Buffer.from(data as string, "binary");

    return buffer;
  }

  return data;
};

const updateTemp = (temp: Record<string, unknown>, options: ParseOptions) => {
  const op = _.cloneDeep(options);
  _.set(op, "body.temp", { ..._.get(op, "body.temp", {}), ...(temp || {}) });
  return op;
};

type ParseResponse = {
  responseObject: ThreePAppCommunication["response"];
  appSlug: string;
  options: ParseOptions;
  app?: ThreePApp;
  pushToLogs?: (log: FusionOperatorLog) => void;
  accountId: string;
  triggerOperator?: SessionOperator;
  fusionSlug?: string;
  operatorIdx?: number;
  appModule?: Partial<ThreePAppModule>;
  epoch?: boolean;
  isGlobal?: boolean;
};

export const parseResponseConfig = async (data: ParseResponse) => {
  const {
    responseObject,
    appSlug,
    options,
    app,
    pushToLogs = () => {
      return;
    },
    accountId,
    triggerOperator,
    fusionSlug,
    operatorIdx,
    appModule,
    epoch = false,
    isGlobal = false,
  } = data;
  // console.log(
  //   "options in parse_response: ",
  //   JSON.stringify({ ...options, functions: undefined }, null, 2)
  // );
  if (!responseObject) {
    console.log("No Response Object");
    return;
  }

  const {
    output: response,
    iterate,
    trigger,
    limit: rawLimit,
    type,
  } = responseObject || {};

  if (iterate && !response) {
    console.log("No Response Required: ", { iterate, output: response });
    return;
  }

  if (type === "raw") {
    _.set(options, "raw", true);
  }

  if (iterate) {
    // console.log("Iterate: ", { iterate, output: response, options });
    return await iterateResponse({
      iterate,
      response,
      appSlug,
      pushToLogs,
      app,
      options: _.cloneDeep(options),
      accountId,
      trigger,
      limit: rawLimit,
      triggerOperator,
      fusionSlug,
      operatorIdx,
      appModule,
      epoch,
      isGlobal,
    });
  } else if (response) {
    console.log("No Iterate");
    console.log("Response: ", { iterate, output: response, options });
    let data = await parseExpression(response, options).catch(() =>
      console.log("response error!")
    );
    console.log("🚀 ~ file: index.ts:358 ~ parseResponseConfig ~ data:", data);

    if (_.isArray(data)) {
      const limit = await parseExpression<number>(rawLimit, options);
      // console.log("🚀 ~ file: index.ts:423 ~ iterateResponse ~ limit", limit);

      if (limit != null) {
        // console.log("Applying Limit");
        data = (data as unknown[]).slice(0, limit);
        // console.log(
        //   "🚀 ~ file: index.ts:597 ~ iterateResponse ~ data",
        //   (data as any[])?.length
        // );
      }
    }

    return data;
  }
};

type IterateResponse = {
  iterate: string;
  response?: string | Record<string, unknown>;
  trigger?: CommunicationTrigger;
  limit?: number;
  triggerOperator?: SessionOperator;
  app?: ThreePApp;
  pushToLogs: (log: FusionOperatorLog) => void;
  appSlug: string;
  options: ParseOptions;
  accountId: string;
  fusionSlug?: string;
  operatorIdx?: number;
  appModule?: Partial<ThreePAppModule>;
  epoch?: boolean;
  isGlobal?: boolean;
};

export const iterateResponse = async (params: IterateResponse) => {
  const {
    iterate,
    appSlug,
    options: baseOptions,
    app,
    pushToLogs,
    response,
    accountId,
    trigger,
    triggerOperator,
    limit: rawLimit,
    fusionSlug,
    operatorIdx,
    appModule,
    epoch = false,
    isGlobal = false,
  } = params;

  // console.log("Iterating with: ", {
  //   iterate,
  //   response,
  //   appSlug,
  //   app,
  //   options: baseOptions,
  //   trigger,
  //   operatorIdx,
  //   epoch,
  //   fusionSlug,
  //   limit,
  //   triggerOperator,
  //   accountId,
  //   isGlobal,
  // });
  const options = _.cloneDeep(baseOptions);

  let data = await parseExpression(iterate, options);
  // console.log("data: ", data, " typeof data: ", typeof data);

  if (!_.isArray(data)) {
    // console.log("iterator is not an array");
    pushToLogs(
      generateLog("Iterator is not an array", "Warning", {
        ...options,
        iterator: data,
      })
    );
    return [];
  }

  const limit = await parseExpression<number>(rawLimit, options);
  // console.log("🚀 ~ file: index.ts:423 ~ iterateResponse ~ limit", limit);

  if (appModule?.module_type === ModuleType.Trigger && trigger) {
    if (!epoch) {
      const fusion = await getFusion(`${fusionSlug}`, accountId);
      // console.log(
      //   "🚀 ~ file: index.ts ~ line 412 ~ iterateResponse ~ fusion",
      //   fusion
      // );
      const epochConfig = fusion?.epoch;
      // console.log(
      //   "🚀 ~ file: index.ts ~ line 413 ~ iterateResponse ~ epochConfig",
      //   epochConfig
      // );
      const triggerResponse = fusion?.fusion_operators?.find(
        (op) => op.operator_slug === triggerOperator?.operator_slug
      )?.triggerResponse;
      // console.log(
      //   "🚀 ~ file: index.ts ~ line 420 ~ iterateResponse ~ triggerResponse",
      //   triggerResponse
      // );
      _.set(options, "body.item", triggerResponse);
      // console.log(
      //   "🚀 ~ file: index.ts ~ line 418 ~ iterateResponse ~ trigger?.type",
      //   trigger?.type
      // );
      if (trigger?.type === "id") {
        const triggerRespId = triggerResponse
          ? await parseExpression(trigger.id, options)
          : undefined;
        // console.log(
        //   "🚀 ~ file: index.ts ~ line 426 ~ iterateResponse ~ triggerRespId",
        //   triggerRespId
        // );
        const lastTriggerId = triggerRespId || epochConfig?.id;
        const triggerData: unknown[] = [];
        for (const d of data) {
          _.set(options, "body.item", d);
          const triggerId = await parseExpression(`${trigger.id}`, options);
          triggerData.push({ ...d, triggerId });
        }
        const sortedData = triggerData.sort((a: any, b: any) =>
          trigger.order === "asc"
            ? a.triggerId - b.triggerId
            : b.triggerId - a.triggerId
        );
        // console.log(
        //   "🚀 ~ file: index.ts ~ line 443 ~ iterateResponse ~ sortedData",
        //   sortedData
        // );
        // let idx = sortedData.findIndex((a: any) =>
        //   lastTriggerId
        //     ? trigger.order === "asc"
        //       ? a.triggerId > lastTriggerId
        //       : a.triggerId < lastTriggerId
        //     : false,
        // );
        let idx = sortedData.findIndex(
          (a: any) => lastTriggerId == a.triggerId
          // ? trigger.order === "asc"
          //   ? a.triggerId > lastTriggerId
          //   : a.triggerId < lastTriggerId
          // : false,
        );
        // console.log(
        //   "🚀 ~ file: index.ts ~ line 451 ~ iterateResponse ~ idx",
        //   idx
        // );
        idx = idx < 0 ? 0 : idx + 1;
        data = sortedData.slice(
          idx,
          limit != null ? idx + (limit || 0) : undefined
        );
        // console.log(
        //   "🚀 ~ file: index.ts ~ line 453 ~ iterateResponse ~ data",
        //   data
        // );
        if (operatorIdx != null && fusionSlug && _.last(data as unknown[])) {
          await updateTriggerResponse(
            accountId,
            fusionSlug,
            operatorIdx,
            _.last(data as unknown[])
          );
        }
      } else if (trigger?.type === "date") {
        const triggerRespDate = triggerResponse
          ? await parseExpression(trigger.date, options)
          : undefined;
        // console.log(
        //   "🚀 ~ file: index.ts ~ line 426 ~ iterateResponse ~ triggerRespId",
        //   triggerRespDate
        // );
        const lastTriggerDate = triggerRespDate || epochConfig?.date;
        const triggerData: unknown[] = [];
        for (const d of data) {
          _.set(options, "body.item", d);
          const triggerId = await parseExpression(`${trigger.date}`, options);
          triggerData.push({ ...d, triggerId });
        }
        const sortedData = triggerData.sort((a: any, b: any) => {
          const condition = moment
            .utc(`${a.triggerId}`)
            .isBefore(moment.utc(`${b.triggerId}`));
          if (trigger.order === "asc") {
            return condition ? -1 : 1;
          } else {
            return condition ? 1 : -1;
          }
        });
        // console.log(
        //   "🚀 ~ file: index.ts ~ line 443 ~ iterateResponse ~ sortedData",
        //   sortedData
        // );
        let idx = -1;
        if (lastTriggerDate) {
          idx = sortedData.findIndex((a: any) => {
            if (trigger.order === "asc") {
              return moment
                .utc(`${a.triggerId}`)
                .isAfter(moment.utc(lastTriggerDate));
            } else {
              return moment
                .utc(`${a.triggerId}`)
                .isBefore(moment.utc(lastTriggerDate));
            }
          });
        }
        // console.log(
        //   "🚀 ~ file: index.ts ~ line 451 ~ iterateResponse ~ idx",
        //   idx
        // );
        // console.log(
        //   "🚀 ~ file: index.ts ~ line 538 ~ iterateResponse ~ triggerResponse",
        //   triggerResponse
        // );
        if (triggerResponse && idx === -1) {
          idx = sortedData.findIndex((a: any) =>
            moment
              .utc(`${a.triggerId}`)
              .isSame(moment.utc(`${triggerResponse.triggerId}`))
          );
          if (idx > -1) {
            idx = idx + 1;
          } else {
            idx = sortedData.length + 1;
          }
        } else if (lastTriggerDate && idx === -1) {
          idx = sortedData.length + 1;
        }
        idx = idx < 0 ? 0 : idx;
        // console.log(
        //   "🚀 ~ file: index.ts ~ line 451 ~ iterateResponse ~ idx after",
        //   idx
        // );
        data = sortedData.slice(
          idx,
          limit != null ? idx + (limit || 0) : undefined
        );
        // console.log(
        //   "🚀 ~ file: index.ts ~ line 453 ~ iterateResponse ~ data",
        //   data
        // );
        if (operatorIdx != null && fusionSlug && _.last(data as unknown[])) {
          await updateTriggerResponse(
            accountId,
            fusionSlug,
            operatorIdx,
            _.last(data as unknown[])
          );
        }
      } else if (limit != null) {
        data = (data as unknown[]).slice(0, limit);
      }
    } else if (limit != null) {
      data = (data as unknown[]).slice(0, limit);
    }
  } else if (limit != null) {
    // console.log("Applying Limit");
    data = (data as unknown[]).slice(0, limit);
    // console.log(
    //   "🚀 ~ file: index.ts:597 ~ iterateResponse ~ data",
    //   (data as any[])?.length
    // );
  }

  const outputs = [];
  // console.time("MappedResponse");
  // if (typeof response === "string") {
  //   for (const item of data as any[]) {
  //     // console.log("mapping for item: ", item);
  //     let parsedOutput: Record<string, unknown> = {};
  //     _.set(options, "body.item", item);
  //     // console.log("options after item application: ", options);
  //     const parsedValue = await parseExpression(response, options);
  //     // console.log("parsed_value: ", parsedValue);
  //     parsedOutput = parsedValue as Record<string, unknown>;
  //     if (epoch && trigger) {
  //       _.set(options, "body.item", item);
  //       const parsedTrigger = await parseExpression(trigger, options);
  //       parsedOutput["data"] = { epoch: parsedTrigger };
  //     }

  //     outputs.push(parsedOutput);
  //   }
  // } else if (
  //   Object.values(response).some(
  //     (v) => _.isString(v) && _.startsWith(v, "rpc://")
  //   )
  // ) {
  //   for (const item of data as any[]) {
  //     // console.log("mapping for item: ", item);
  //     const parsedOutput: Record<string, unknown> = {};

  //     for (const [key, value] of Object.entries(response)) {
  //       // console.log("is RPC: ", value);
  //       _.set(options, "body.rpc_data", item);
  //       // console.log("options after rpc application: ", options);
  //       try {
  //         const rpcResponses = await callRpc(
  //           appSlug,
  //           `${value}`,
  //           app,
  //           _.cloneDeep(options.body) || {},
  //           options.functions || [],
  //           pushToLogs,
  //           accountId,
  //           isGlobal
  //         );
  //         // console.log("rpcResponses: ", rpcResponses);
  //         parsedOutput[key] = _.last(rpcResponses);
  //       } catch (e) {
  //         console.log((e as Error).message);
  //         parsedOutput[key] = undefined;
  //       }
  //       continue;
  //     }

  //     if (epoch && trigger) {
  //       _.set(options, "body.item", item);
  //       const parsedTrigger = await parseExpression(trigger, options);
  //       parsedOutput["data"] = { epoch: parsedTrigger };
  //     }

  //     outputs.push(parsedOutput);
  //   }
  // } else {
  //   if (epoch && trigger) {
  //     const result = await Promise.all(
  //       (data as any[]).map(async (item) => {
  //         // const parsedOutput: Record<string, unknown> = {};
  //         const opt = { ...options, body: { ...(options.body || {}), item } };
  //         const parsedValue = await parseExpression<Record<string, unknown>>(
  //           response,
  //           opt
  //         );
  //         const parsedTrigger = await parseExpression(trigger, options);
  //         parsedValue["data"] = parsedTrigger;
  //         return parsedValue;
  //       })
  //     );
  //     outputs.push(...result);
  //   } else {
  //     console.time("simpleParse");
  //     console.log("simple parse start");
  //     const result = await Promise.all(
  //       (data as any[]).map(async (item) => {
  //         // const parsedOutput: Record<string, unknown> = {};
  //         const parsedValue = await parseExpression(response, {
  //           ...options,
  //           body: { ...(options.body || {}), item },
  //         });
  //         return parsedValue;
  //       })
  //     );
  //     console.timeEnd("simpleParse");
  //     outputs.push(...result);
  //   }
  // }
  // console.log(
  //   "🚀 ~ file: index.ts:793 ~ iterateResponse ~ data:",
  //   JSON.stringify(data, null, 2)
  // );
  for (const item of data as any[]) {
    // console.log("mapping for item: ", item);
    let parsedOutput: Record<string, unknown> = {};
    if (typeof response === "string") {
      _.set(options, "body.item", item);
      // console.log("options after item application: ", options);
      const parsedValue = await parseExpression(response, options);
      // console.log("parsed_value: ", parsedValue);
      parsedOutput = parsedValue as Record<string, unknown>;
    } else {
      // for (const [key, value] of Object.entries(response)) {
      //   // console.log("mapping for value: ", { key, value }, "item: ", item);
      //   if (_.isString(value) && _.startsWith(value, "rpc://")) {
      //     // console.log("is RPC: ", value);
      //     _.set(options, "body.rpc_data", item);
      //     // console.log("options after rpc application: ", options);
      //     try {
      //       const rpcResponses = await callRpc(
      //         appSlug,
      //         value,
      //         app,
      //         _.cloneDeep(options.body) || {},
      //         options.functions || [],
      //         pushToLogs,
      //         accountId,
      //         isGlobal
      //       );
      //       // console.log("rpcResponses: ", rpcResponses);
      //       parsedOutput[key] = _.last(rpcResponses);
      //     } catch (e) {
      //       console.log((e as Error).message);
      //       parsedOutput[key] = undefined;
      //     }
      //     continue;
      //   }

      //   _.set(options, "body.item", item);
      //   // console.log("options after item application: ", options);
      //   const parsedValue = await parseExpression(value, options);
      //   // console.log("parsed_value: ", parsedValue);
      //   parsedOutput[key] = parsedValue;
      // }
      _.set(options, "body.item", item);
      parsedOutput = await parseExpression(response, options);
    }

    if (epoch && trigger) {
      _.set(options, "body.item", item);
      const parsedTrigger = await parseExpression(trigger, options);
      parsedOutput["data"] = { epoch: parsedTrigger };
    }

    outputs.push(parsedOutput);
  }
  // console.timeEnd("MappedResponse");

  // console.log("mappedResponse: ", JSON.stringify(outputs, null, 2));

  return outputs;
};

const updateTriggerResponse = async (
  accountId: string,
  fusionSlug: string,
  operatorIdx: number,
  value: unknown
) => {
  await dynamodb.update({
    TableName: `${envTableNames.DYNAMODB_ACCT_FUSIONS}`,
    Key: {
      id: `${accountId}:fusions`,
      slug: fusionSlug,
    },
    UpdateExpression: `set fusion_operators[${operatorIdx}].triggerResponse = :value`,
    ExpressionAttributeValues: {
      ":value": value,
    },
  });
};
