/* eslint @typescript-eslint/no-unsafe-argument: 0 */
import { ErrorObject } from "ajv/dist/types/index";
const defaults = {
  logger: console.error,
  fallbackMessage: null,
};

const jsonschemaErrors = (opts?: {
  logger: (msg: string) => void;
  fallbackMessage?: string;
}) => {
  const options = { ...defaults, ...opts };
  const jsonschemaErrosMiddlewareOnError = (request: any) => {
    console.log("-----error------", request);
    if (typeof options.logger === "function") {
      options.logger(request?.error);
    }
    console.log("request.error.statusCode", request.error.statusCode);
    if (request.error.expose || request.error.statusCode === 400) {
      if (!request.response) request.response = {};
      if (!request.response.headers) request.response.headers = {};

      request.response.statusCode = request.error.statusCode;
      request.response.message =
        request?.response?.body || request.error.message;
      request.response.headers["Content-Type"] = "application/json";

      if (Array.isArray(request.error.cause)) {
        request.response.body = {
          message: request.response.message,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          errors: request.error.cause.map((error: ErrorObject) => ({
            detail: error.message,
            source: {
              pointer: error.schemaPath.substring(1),
              parameter: error.instancePath.substring(1),
            },
            meta: error.params,
          })),
        };
      } else {
        request.response.body = request.error.cause || {
          message: request.response.body || request.error.message,
        };
      }

      request.response.body = JSON.stringify(request.response.body);
      console.log("request.response;", request.response);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return request.response;
    }
  };
  return {
    onError: jsonschemaErrosMiddlewareOnError,
  };
};

export default jsonschemaErrors;
