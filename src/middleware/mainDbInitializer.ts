import middy from "@middy/core";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { dynamodb } from "../helpers/db";

const mainDbInitializer = (): middy.MiddlewareObj<
  APIGatewayProxyEvent,
  APIGatewayProxyResult
> => {
  const before: middy.MiddlewareFn<
    APIGatewayProxyEvent,
    APIGatewayProxyResult
  > = async () => {
    await dynamodb.initMainAccountDB();
  };

  return {
    before,
  };
};

export default mainDbInitializer;
