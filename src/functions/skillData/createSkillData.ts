import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import createHttpError from "http-errors";
import { v4 } from "uuid";
import { DocumentElementType } from "../../constants/dataset";
import { getAuroraConnection } from "../../helpers/db/aurora";
import {
  getSkillDataTableName,
  getSkillRecordIdKey,
  healTable,
} from "../../helpers/skillData";
import type { ValidatedEventAPIGatewayProxyEvent } from "../../lib/apiGateway";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { Account, AccountUser } from "../../types";
import { getFusion } from "../../util/fusion";

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        fields: {
          type: "object",
          default: {},
        },
      },
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  console.log(
    "🚀 ~ file: createSkillData.ts:36 ~ >= ~ event:",
    JSON.stringify(event, null, 2)
  );
  const { fields } = event.body;
  const {
    skill_design_slug,
    table_slug,
    sidebar_slug,
    type,
    parent_sidebar_slug,
  } = event.queryStringParameters || {};
  const account = event.account as Account;
  const auroraDbName = account.database_name;

  if (!auroraDbName) {
    console.log("No aurora db name found in account");
    throw createHttpError(
      500,
      "Internal server error: No aurora db name found in account"
    );
  }
  console.log(
    "🚀 ~ file: createSkillData.ts:48 ~ >= ~ auroraDbName:",
    auroraDbName
  );

  const tableName = getSkillDataTableName({
    skillDesignSlug: skill_design_slug,
    tableSlug: table_slug,
    sidebarSlug: sidebar_slug,
    type,
  });
  console.log("🚀 ~ file: createSkillData.ts:61 ~ >= ~ tableName:", tableName);

  const user = event.user as AccountUser;
  const userId = user.slug;

  if (!userId) {
    console.log("No user_id found in body");
    throw createHttpError(400, "No user_id found in body");
  }

  const defaultColumns = [
    getSkillRecordIdKey(tableName.slice(1, -1)),
    "id",
    "user_id",
  ];
  const idValue = `'${v4()}'`;
  const defaultColumnValues = [idValue, idValue, `'${userId}'`];
  if (type === "sidebar") {
    defaultColumns.push(`parent_${table_slug}_id`);
    defaultColumnValues.push(
      parent_sidebar_slug ? `'${parent_sidebar_slug}'` : "NULL"
    );
  }
  console.log(
    "🚀 ~ file: createSkillData.ts:80 ~ >= ~ defaultColumns:",
    defaultColumns
  );
  console.log(
    "🚀 ~ file: createSkillData.ts:81 ~ >= ~ defaultColumnValues:",
    defaultColumnValues
  );

  const skillDesign = await getFusion(skill_design_slug!, account.slug);
  console.log(
    "🚀 ~ file: createSkillData.ts:87 ~ >= ~ skillDesign:",
    skillDesign
  );

  let dataFields = [];

  if (type === "sidebar") {
    const sidebar = skillDesign?.skill_user_table_sidebars?.find(
      (s) => s.slug === sidebar_slug
    );

    if (!sidebar) {
      throw createHttpError(404, `No sidebar found with slug ${sidebar_slug}`);
    }

    dataFields = sidebar.fields?.fields || [];
  } else {
    const table = skillDesign?.skill_user_tables?.find(
      (t) => t.slug === table_slug?.split(".")[1]
    );

    if (!table) {
      throw createHttpError(404, `No table found with slug ${table_slug}`);
    }

    dataFields = table.fields?.fields || [];
  }
  console.log(
    "🚀 ~ file: createSkillData.ts:110 ~ >= ~ dataFields:",
    dataFields
  );

  const connection = await getAuroraConnection(auroraDbName);
  console.log(
    "🚀 ~ file: createSkillData.ts:113 ~ >= ~ connection:",
    connection
  );

  console.log("Healing Table");
  await healTable(connection, tableName, [
    ...defaultColumns.map((c) => ({
      slug: c,
      type: DocumentElementType.TextField,
      id: c,
      title: "",
    })),
    ...dataFields,
  ]);

  const { keys, values } = Object.entries(fields || {}).reduce<{
    keys: string[];
    values: string[];
  }>(
    (acc, [key, value]) => {
      acc.keys.push(key);
      if (typeof value === "string") {
        acc.values.push(`'${value}'`);
      } else if (typeof value === "number") {
        acc.values.push(`${value}`);
      } else if (typeof value === "boolean") {
        if (value) {
          acc.values.push("TRUE");
        } else {
          acc.values.push("FALSE");
        }
      } else if (typeof value === "object") {
        acc.values.push(`'${JSON.stringify(value)}'`);
      }
      return acc;
    },
    { keys: defaultColumns, values: defaultColumnValues }
  );
  console.log(
    "🚀 ~ file: createSkillData.ts:109 ~ const{keys,values}=Object.entries ~ keys, values:",
    keys,
    values
  );
  if (keys.length > 0 && values.length > 0) {
    const sql = `INSERT INTO ${tableName} (${keys
      .map((k) => `\`${k}\``)
      .join(",")}) VALUES (${values.join(",")});`;
    console.log("🚀 ~ file: createSkillData.ts:135 ~ >= ~ sql:", sql);

    await connection.execute(sql);
  }

  return {
    statusCode: 200,
    body: {
      data: keys.reduce<Record<string, unknown>>((acc, cur, idx) => {
        acc[cur] = values[idx].slice(1, -1);

        return acc;
      }, {}),
    },
  };
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
  .use(getUser())
  .use(getAccountData())
  .use(jsonschemaErrors())
  .use(httpErrorHandler())
  .use(
    responseSerializer({
      serializers: [
        {
          regex: /^application\/json$/,
          serializer: ({ body }: any) => JSON.stringify(body),
        },
      ],
      defaultContentType: "application/json",
    })
  )
  .handler(lambdaHandler); // handles common http errors and returns proper responses
