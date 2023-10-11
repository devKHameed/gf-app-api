import middy from "@middy/core";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import get from "lodash/get";
import { Account } from "../types";
import getAccount from "../util/getAccount";

const getAccountData = (
  idPath?: string
): middy.MiddlewareObj<
  APIGatewayProxyEvent & { account?: Account },
  APIGatewayProxyResult
> => {
  const before: middy.MiddlewareFn<
    APIGatewayProxyEvent & { account?: Account },
    APIGatewayProxyResult
  > = async (req): Promise<void> => {
    const accountId = req.event.headers["account-id"] ?? get(req, idPath || "");
    //    console.log("🚀 ~ file: getAccountData.ts ~ line 19 ~ >= ~ idPath", idPath);
    if (accountId) {
      const account = await getAccount(accountId as string);
      req.event.account = account as unknown as Account;
    }
  };

  return {
    before,
  };
};

export default getAccountData;
