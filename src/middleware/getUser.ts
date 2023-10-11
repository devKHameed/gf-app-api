import middy from "@middy/core";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AccountUser } from "../types";
import { getUserFromToken } from "../util/index";

const getUser = (): middy.MiddlewareObj<
  APIGatewayProxyEvent & { user?: AccountUser },
  APIGatewayProxyResult
> => {
  const before: middy.MiddlewareFn<
    APIGatewayProxyEvent & { user?: AccountUser },
    APIGatewayProxyResult
  > = async (req): Promise<void> => {
    console.log(
      "🚀 ~ file: getUser.ts:22 ~ >= ~ req.event.headers.authorization",
      req.event.headers.authorization
    );
    const user = await getUserFromToken(`${req.event.headers.authorization}`);

    console.log("🚀 ~ file: getUser.ts:20 ~ >= ~ user", user);
    if (user) {
      req.event.user = user;
    }
  };

  return {
    before,
  };
};

export default getUser;
