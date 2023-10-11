import middy from "@middy/core";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Account } from "../types";

const has3pAppAccess = (): middy.MiddlewareObj<
  APIGatewayProxyEvent & { account?: Account },
  APIGatewayProxyResult
> => {
  const before: middy.MiddlewareFn<
    APIGatewayProxyEvent & { account?: Account },
    APIGatewayProxyResult
  > = (req) => {
    const account = req.event.account;
    console.log("🚀 ~ file: has3pAppAccess.ts ~ line 14 ~ account", account);

    const threePAppEnabled = !!account?.three_p_app_settings?.three_p_app_enabled;
    if (!threePAppEnabled) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: "Access Denied!" }),
      };
    }
  };

  return {
    before,
  };
};

export default has3pAppAccess;
