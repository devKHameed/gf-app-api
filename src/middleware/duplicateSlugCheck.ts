import middy from "@middy/core";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import get from "lodash/get";
import { dynamodb } from "../helpers/db";

type Event = Omit<APIGatewayProxyEvent, "body"> & {
  body: Record<string, unknown>;
};

const duplicateSlugCheck = (options: {
  slugKey?: string;
  tableName: string;
  queryType?: "query" | "get";
  accountPostfix?: string;
  keyMap?: {
    idKey?: string;
    slugKey?: string;
  };
  getKey?: (
    accountId: string,
    slug: string,
    event: any
  ) => Record<string, unknown>;
  getParams?: (
    accountId: string,
    slug: string,
    body: Record<string, unknown>
  ) => void;
}): middy.MiddlewareObj<Event, APIGatewayProxyResult> => {
  const before: middy.MiddlewareFn<Event, APIGatewayProxyResult> = async (
    req
  ) => {
    const {
      slugKey = "slug",
      queryType = "get",
      keyMap,
      accountPostfix = "",
      getKey,
      tableName,
      getParams,
    } = options;
    const accountId = req.event.headers["account-id"];
    const slug = get(req.event.body, slugKey) as string;

    if (!accountId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "account id is missing" }),
      };
    }

    if (!getKey && !slug) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "slug is missing" }),
      };
    }

    let item: any;

    if (queryType === "get") {
      const { Item } = await dynamodb.get({
        TableName: tableName,
        Key: getKey?.(
          accountId,
          slug,
          req.event as unknown as Record<string, unknown>
        ) || {
          [keyMap?.idKey || "id"]: accountPostfix
            ? `${accountId}:${accountPostfix}`
            : accountId,
          [keyMap?.slugKey || "slug"]: slug,
        },
      });

      item = Item;
    } else {
      const { Items = [] } = await dynamodb.query({
        TableName: tableName,
        KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
        ExpressionAttributeValues: {
          ":id": keyMap?.idKey || "id",
          ":slug": keyMap?.slugKey || "slug",
        },
        ExpressionAttributeNames: {
          "#id": accountPostfix ? `${accountId}:${accountPostfix}` : accountId,
          "#slug": slug,
        },
        ...(getParams?.(
          accountId,
          slug,
          req.event.body as unknown as Record<string, unknown>
        ) || {}),
      });
      item = Items[0];
    }

    if (item) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Slug already exists" }),
      };
    }
  };

  return {
    before,
  };
};

export default duplicateSlugCheck;
