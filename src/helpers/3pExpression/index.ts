import _, { isArray, isBuffer, isString } from "lodash";
import { GFMLFunction, MappableParameter, ThreePApp } from "types/Fusion/3pApp";
import { applyToValues, checkHasTags, isValidJson } from "../../util/index";
import { getGFMLFunctions, getGlobalGFMLFunctions } from "../gfmlFunctions";
import { callRpc } from "../rpc";
import { parse3PExpressions } from "./expressionParser";
import { parseTagsToExpression } from "./tagsParser";

const parseTags = <T = unknown>(data: T) => {
  return applyToValues(data, parseTagsToExpression);
};

const parseBoolean = (value: unknown): boolean => {
  if (_.isBoolean(value)) {
    return value;
  }

  if (_.isString(value)) {
    if (value === "true") return true;
    if (value === "false") return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
};

const parseNumber = (value: unknown): number => {
  if (_.isNumber(value)) {
    return value;
  }

  if (_.isString(value)) {
    const number = _.toNumber(value);

    if (!_.isNaN(number)) return number;
  }

  throw new Error(`Invalid number value: ${value}`);
};

const parseInteger = (value: unknown, flag?: "u"): number => {
  if (_.isInteger(value)) {
    return value as number;
  }

  if (_.isString(value)) {
    const number = _.toNumber(value);

    if (!_.isNaN(number))
      return flag === "u" ? Math.abs(_.toInteger(number)) : _.toInteger(number);
  }

  throw new Error(`Invalid integer value: ${value}`);
};

const parseArray = (value: unknown, parameter: MappableParameter = {}) => {
  if (!_.isArray(value)) {
    throw new Error(
      "Invalid array value: " + JSON.stringify({ value, parameter }, null, 2)
    );
  }
  if (_.isPlainObject(parameter.spec)) {
    // const specType = (parameter.spec as MappableParameter).type;

    return value.map((v) =>
      fixTypes(v as Record<string, unknown>, [
        parameter.spec as MappableParameter,
      ])
    );
  }

  if (_.isArray(parameter.spec)) {
    return value.map((v) =>
      parseCollection(
        v as Record<string, unknown>,
        parameter.spec as MappableParameter[]
      )
    );
  }

  return value as unknown;
};

const parseCollection = (
  value: Record<string, unknown>,
  parameters: MappableParameter[] = []
): unknown => {
  if (!_.isPlainObject(value)) {
    throw new Error(
      "Invalid collection value: " +
        JSON.stringify({ value, parameters }, null, 2)
    );
  }

  return fixTypes(value, isArray(parameters) ? parameters : [parameters]);
};

const parseValueType = (
  parameterType = "",
  value: unknown,
  parameter: MappableParameter
): unknown => {
  if (parameterType === "boolean") {
    return parseBoolean(value);
  } else if (parameterType === "number") {
    return parseNumber(value);
  } else if (parameterType === "integer") {
    return parseNumber(value);
  } else if (parameterType === "uinteger") {
    return parseInteger(value, "u");
  } else if (parameterType === "array") {
    return parseArray(value, parameter);
  } else if (parameterType === "collection") {
    return parseCollection(
      value as Record<string, unknown>,
      parameter.spec as MappableParameter[]
    );
  } else {
    return value;
  }
};

const fixTypes = (
  value: Record<string, unknown> = {},
  parameters: MappableParameter[] = []
) => {
  return Object.entries(value).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      console.log("🚀 ~ file: index.ts:129 ~ parameters:", parameters);
      const parameter = parameters?.find((p) => p.name === key);

      if (!parameter) {
        acc[key] = value;
        return acc;
      }

      const parameterType = parameter.type;

      acc[key] = parseValueType(parameterType, value, parameter);

      return acc;
    },
    {}
  );
};

const processRpc = async (
  rpc: string,
  body: Record<string, unknown>,
  functions: GFMLFunction[],
  app: ThreePApp,
  accountId: string
) => {
  const rpcResponses = await callRpc(
    (body.parameters as Record<string, unknown>).app_id as string,
    rpc,
    app,
    _.cloneDeep(body),
    functions,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    () => {},
    accountId
  );

  return _.last(rpcResponses);
};

const processParameters = (
  parameters: Record<string, unknown>,
  operators: Record<string, unknown>,
  functions: GFMLFunction[],
  mappableParameters: MappableParameter[] = []
) => {
  if (!parameters) {
    return {};
  }

  if (!checkHasTags(parameters)) {
    // return parameters;
    console.log(
      "🚀 ~ file: index.js ~ line 149 ~ parameters, mappable_parameters",
      JSON.stringify({ parameters, mappableParameters })
    );
    const result = fixTypes(parameters, mappableParameters);
    // console.log(
    //   "🚀 ~ file: index.js ~ line 150 ~ result",
    //   JSON.stringify(result, null, 2)
    // );
    return result;
  }

  const parsedParameters = parseTags(parameters);
  // console.log("parsedParameters: ", JSON.stringify(parsedParameters, null, 2));
  let result = applyToValues(
    parsedParameters,
    parse3PExpressions,
    { body: operators },
    functions
  );
  // console.log(
  //   "processParameters: applyToValues: parse3PExpressions: ",
  //   JSON.stringify(result, null, 2)
  // );
  result = fixTypes(result, mappableParameters);
  // console.log("processParameters: fixTypes: ", JSON.stringify(result, null, 2));

  return result;
};

const parse = (
  value: string,
  body: Record<string, unknown>,
  operators: Record<string, unknown>,
  functions: GFMLFunction[],
  mappableParameters: MappableParameter[] = [],
  threePApp: ThreePApp,
  accountId: string,
  raw: boolean
): Promise<unknown> | unknown => {
  // console.log("parse: ", JSON.stringify({ value, body, operators }, null, 2));
  if (_.startsWith("rpc://")) {
    return new Promise((res, rej) => {
      processRpc(value, body, functions, threePApp, accountId)
        .then((result) => res(result))
        .catch((err) => rej(err));
    });
  }
  // const parameters = processParameters(
  //   body.parameters as Record<string, unknown>,
  //   operators,
  //   functions,
  //   mappableParameters
  // );
  const body_data: Record<string, unknown> = {
    ...body,
    // parameters,
    payload: operators?.payload,
    // body: body.body ? { ...body.body, ...operators } : { ...operators },
  };
  if (body.body && !_.isEmpty(operators)) {
    if (_.isPlainObject(body.body)) {
      body_data.body = { ...body.body, ...operators };
    }
  } else if (!_.isEmpty(operators)) {
    body_data.body = operators;
  }
  // console.log(
  //   "🚀 ~ file: index.js ~ line 188 ~ parse ~ body_data",
  //   JSON.stringify(body_data, null, 2)
  // );
  // console.log(_.merge(body.body, operators));
  let result = parse3PExpressions(value, body_data, functions, raw);
  // console.log("parse3PExpressions: ", JSON.stringify(result, null, 2));
  // result = parseValue(result);
  // console.log("parseValue: ", JSON.stringify(result, null, 2));
  let tags = checkHasTags(result);
  // console.log("checkHasTags: ", tags);
  let loopCounter = 0;
  while (tags && loopCounter < 10) {
    try {
      // console.log("loopCounter: ", loopCounter);
      result = parseTags(result);
      // console.log("parseTags: ", JSON.stringify(result, null, 2));
      result = applyToValues(
        result,
        parse3PExpressions,
        { body: operators },
        functions,
        raw
      );
      // console.log(
      //   "applyToValues: parse3PExpressions: ",
      //   JSON.stringify(result, null, 2)
      // );
      // result = parseValue(result);
      // console.log("parseValue: ", JSON.stringify(result, null, 2));
      tags = checkHasTags(result);
      // console.log("checkHasTags: ", tags);
      loopCounter++;
    } catch (e) {
      break;
    }
  }

  // console.log(isValidJson(result as string));
  if (isString(result)) {
    result = result.replace(/\n/g, "\\n");
    if (isValidJson(result as string)) {
      result = JSON.parse(result as string);
    } else {
      result = (result as string).replace(/\\n/g, "\n");
    }
  }
  // console.log("🚀 ~ file: index.ts:287 ~ result:", result);

  // return isString(result) && isValidJson(result) ? JSON.parse(result) : result;
  return result;
};

export const getFunctions = async (app: string, accountId: string) => {
  const [
    functions,
    globalAccountFunctions,
    globalAppFunctions,
    globalFunctions,
  ] = await Promise.all([
    getGFMLFunctions(app, accountId),
    getGlobalGFMLFunctions(accountId),
    getGFMLFunctions(app, "global"),
    getGlobalGFMLFunctions("global"),
  ]);
  return [
    ...globalAppFunctions,
    ...globalFunctions,
    ...globalAccountFunctions,
    ...functions,
  ];
};

type BaseOptions = Partial<{
  body: Record<string, unknown>;
  responses: Record<string, unknown>;
  mappableParameters: MappableParameter[];
  threePApp?: ThreePApp;
  accountId?: string;
  raw?: boolean;
}>;

type FunctionOptions = BaseOptions & {
  functions?: GFMLFunction[];
  app?: never;
};

type AppOptions = BaseOptions & {
  functions?: never;
  app?: string;
};

export type ParseOptions = AppOptions | FunctionOptions;

export const parseExpression = async <T = unknown>(
  data: unknown,
  options: ParseOptions
): Promise<T> => {
  console.log(
    "Parse Expression: ",
    data,
    JSON.stringify({ ...options, functions: undefined }, null, 2)
  );
  if (!data) {
    return Promise.resolve(undefined as T);
  }
  const {
    body = {},
    responses = {},
    mappableParameters = [],
    threePApp,
    accountId,
    raw,
  } = options;
  const gfmlFunctions =
    options.functions ??
    (await getFunctions(`${options.app}`, options.app ? `${accountId}` : ""));
  // console.log("GFML Functions: ", gfmlFunctions);
  const final_value = applyToValues(
    data,
    parse,
    body,
    responses,
    gfmlFunctions,
    mappableParameters,
    threePApp,
    accountId,
    raw
  );
  console.log(
    "Parse Expression Response: ",
    final_value,
    typeof final_value,
    isBuffer(final_value)
  );
  return final_value as T;
};
