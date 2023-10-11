import type { APIGatewayProxyEvent, Handler } from "aws-lambda";
import type { FromSchema } from "json-schema-to-ts";

type ValidatedAPIGatewayProxyEvent<S> = Omit<APIGatewayProxyEvent, "body"> &
  FromSchema<S>;
export type APIGatewayProxyResultA = Partial<
  Omit<APIGatewayProxyEvent, "body">
> & {
  body: any;
};

export type ValidatedEventAPIGatewayProxyEvent<S = any> = Handler<
  ValidatedAPIGatewayProxyEvent<S>,
  APIGatewayProxyResultA | any
>;
