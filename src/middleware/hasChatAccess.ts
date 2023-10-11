import middy from "@middy/core";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Account } from "../types";

const hasChatAccess = (): middy.MiddlewareObj<
  APIGatewayProxyEvent & { account?: Account },
  APIGatewayProxyResult
> => {
  const before: middy.MiddlewareFn<
    APIGatewayProxyEvent & { account?: Account },
    APIGatewayProxyResult
  > = (req) => {
    const account = req.event.account;
    console.log("🚀 ~ file: hasChatAccess.ts:14 ~ account", account);
    const chatEnabled = !!account?.chat_settings?.chat_enabled;
    if (!chatEnabled) {
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

export default hasChatAccess;
