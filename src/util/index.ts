import { DynamoDB } from "aws-sdk";
import jwt from "jsonwebtoken";
import _, { isObject } from "lodash";
import { v4 } from "uuid";
import {
  ACCOUNT_UPLOAD_DESIGN_TABLE_NAME,
  envTableNames,
  FOLDERS,
  SYSTEM_USERS,
} from "../config";
import { dynamodb } from "../helpers/db";
import { AccountUser, Contact, ContactListRule } from "../types";
import { UploadDesign } from "../types/UploadDesign";
import buildUpdateExpression from "./buildUpdateExpression";

export const isValidJson = <T = unknown>(data: string): T | false => {
  try {
    const response = JSON.parse(data) as T;
    if (!_.isObjectLike(response)) {
      return false;
    }
    return response;
  } catch (e) {
    return false;
  }
};

export const hasTags = (str: string) => {
  const s = str;
  const tagStart = s.indexOf("[[{");
  const tagEnd = s.indexOf("}]]");
  const json = s.slice(tagStart + 2, tagEnd + 1);
  // console.log("🚀 ~ file: index.ts:33 ~ hasTags ~ json:", json);
  if (tagStart > -1 && tagEnd > -1 && isValidJson(json)) {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (isObject(parsed) && !!parsed.type && !!parsed.slug) {
      return true;
    }
    return false;
  }

  return false;
};

export const checkHasTags = (data: unknown) => {
  if (_.isArray(data)) {
    const hasTags = data.some((d: any) => checkHasTags(d));
    return hasTags;
  }

  if (_.isObject(data)) {
    const hasTags = Object.values(data).some((d: any) => checkHasTags(d));
    return hasTags;
  }

  if (_.isString(data)) {
    return hasTags(data);
  }

  return false;
};

type ReturnValue<D, R> = D extends string
  ? R
  : D extends unknown[]
  ? R[]
  : D extends object
  ? { [P in keyof D]: R }
  : D;

export const applyToValues = <D, F extends (...args: any[]) => any>(
  data: D,
  func: F,
  ...funcArgs: unknown[]
): ReturnValue<D, ReturnType<typeof func>> => {
  if (_.isArray(data)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return data.map((d) => applyToValues(d, func, ...funcArgs)) as ReturnValue<
      D,
      ReturnType<typeof func>
    >;
  }

  if (_.isObject(data)) {
    return _.mapValues(data, (value) =>
      applyToValues(value, func, ...funcArgs)
    ) as ReturnValue<D, ReturnType<typeof func>>;
  }

  if (_.isString(data)) {
    return func(data, ...funcArgs) as ReturnValue<D, ReturnType<typeof func>>;
  }

  return data as ReturnValue<D, ReturnType<typeof func>>;
};

export const isValidUrl = (url: string) => {
  try {
    const u = new URL(url);
    return !!u;
  } catch (err) {
    return false;
  }
};

export async function* queryAll<DataType = unknown>(
  query: DynamoDB.DocumentClient.QueryInput
) {
  const res = await dynamodb.query(query);
  let items = {
      items: res.Items as DataType[],
      lastEvaluatedKey: res.LastEvaluatedKey,
    },
    lastEvaluatedKey = res.LastEvaluatedKey;
  yield items;

  while (lastEvaluatedKey) {
    const res = await dynamodb.query({
      ...query,
      ExclusiveStartKey: lastEvaluatedKey,
    });
    lastEvaluatedKey = res.LastEvaluatedKey;
    items = {
      items: res.Items as DataType[],
      lastEvaluatedKey: lastEvaluatedKey,
    };
    yield items;
  }
}

export const sleep = async (timeout: number) => {
  return new Promise((resolve) => setTimeout(resolve, timeout));
};

export const isContactRuleSatisfied = (
  contact: Omit<Partial<Contact>, "contact_tags" | "contact_types"> &
    Pick<Contact, "contact_tags" | "contact_types">,
  rule: ContactListRule
) => {
  return (
    contact.contact_types.every((type) =>
      rule.types_to_include.includes(type)
    ) &&
    rule.types_to_include.every((type) =>
      contact.contact_types.includes(type)
    ) &&
    contact.contact_tags.every((tag) => rule.tags_to_include.includes(tag)) &&
    rule.tags_to_include.every((tag) => contact.contact_tags.includes(tag))
  );
};

export const getUserFromToken = async (authorization: string) => {
  const token = authorization.replace("Bearer ", "");
  const user = jwt.decode(token) as { email: string };
  console.log("🚀 ~ file: index.ts:141 ~ getUserFromToken ~ user", user);

  if (user.email) {
    return await getUser(user.email);
  }
};

export const getUser = async (email: string) => {
  const { Items = [] } = await dynamodb.query({
    TableName: envTableNames.DYNAMODB_SYS_USERS_TABLE,
    IndexName: "email_lsi_index",
    KeyConditionExpression: "#id = :id AND #email = :email",
    ExpressionAttributeNames: {
      "#email": "email",
      "#id": "id",
    },
    ExpressionAttributeValues: {
      ":id": SYSTEM_USERS,
      ":email": email,
    },
  });
  console.log("🚀 ~ file: index.ts:158 ~ getUser ~ Items:", Items);

  return Items[0] as AccountUser | undefined;
};
export const getUserBySlug = async (slug: string) => {
  if (!slug) throw new Error("slug can't be undefined");
  const { Items = [] } = await dynamodb.query({
    TableName: envTableNames.DYNAMODB_SYS_USERS_TABLE,
    KeyConditionExpression: "#id = :id AND #slug = :slug",
    ExpressionAttributeNames: {
      "#slug": "slug",
      "#id": "id",
    },
    ExpressionAttributeValues: {
      ":id": SYSTEM_USERS,
      ":slug": slug,
    },
  });
  console.log("🚀 ~ file: index.ts:158 ~ getUser ~ Items:", Items);

  return Items[0] as AccountUser | undefined;
};
export const addItemToFolder = async (
  accountId: string,
  resourceName: string,
  folderName: string,
  itemSlug: string,
  itemId: string
) => {
  const readParams: DynamoDB.DocumentClient.QueryInput = {
    TableName: `${envTableNames.DYNAMODB_ACCT_FOLDERS}`,
    KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
    FilterExpression: "#name = :name",
    ExpressionAttributeNames: {
      "#id": "id",
      "#slug": "slug",
      "#name": "name",
    },
    ExpressionAttributeValues: {
      ":id": `${accountId}:${FOLDERS}`,
      ":slug": `false:${resourceName}`,
      ":name": folderName,
    },
  };

  const { Items: folders = [] } = await dynamodb.query(readParams);

  if (folders.length) {
    const childs = folders[0].childs as Record<string, unknown>[];

    childs.push({
      id: itemId,
      slug: itemSlug,
    });

    const params: DynamoDB.DocumentClient.UpdateItemInput =
      buildUpdateExpression({
        tableName: envTableNames.DYNAMODB_ACCT_FOLDERS,
        keys: {
          id: `${accountId}:${FOLDERS}`,
          slug: folders[0].slug!,
        },
        item: {
          childs,
        },
      });

    await dynamodb.update(params);
  } else {
    const folderParams: DynamoDB.DocumentClient.PutItemInput = {
      TableName: envTableNames.DYNAMODB_ACCT_FOLDERS,
      Item: {
        id: `${accountId}:${FOLDERS}`,
        slug: `false:${resourceName}:${v4()}`,
        name: folderName,
        sort_order: 0,
        childs: [
          {
            id: itemId,
            slug: itemSlug,
          },
        ],
        created_at: new Date().toISOString(),
        updated_at: null,
        is_deleted: 0,
      },
    };

    await dynamodb.put(folderParams);
  }
};

export const getUploadDesign = async (accountId: string, slug: string) => {
  const { Item } = await dynamodb.get({
    TableName: envTableNames.DYNAMODB_ACCT_UPLOAD_DESIGN,
    Key: {
      id: `${accountId}:${ACCOUNT_UPLOAD_DESIGN_TABLE_NAME}`,
      slug: slug,
    },
  });

  return Item as UploadDesign | undefined;
};
