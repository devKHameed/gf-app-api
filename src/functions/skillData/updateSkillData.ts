import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import createHttpError from "http-errors";
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
import { Account } from "../../types";
import { getFusion } from "../../util/fusion";

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        fields: {
          type: "object",
        },
      },
      required: ["fields"],
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  console.log(
    "🚀 ~ file: updateSkillData.ts:35 ~ >= ~ event:",
    JSON.stringify(event, null, 1)
  );
  const { fields } = event.body;
  const { slug } = event.pathParameters || {};
  if (!slug) {
    console.log("No slug");
    throw createHttpError(400, "Missing slug");
  }

  const { skill_design_slug, table_slug, sidebar_slug, type } =
    event.queryStringParameters || {};
  const account = event.account as Account;
  const auroraDbName = account.database_name;
  console.log(
    "🚀 ~ file: updateSkillData.ts:50 ~ >= ~ auroraDbName:",
    auroraDbName
  );

  if (!auroraDbName) {
    console.log("No aurora db name found in account");
    throw createHttpError(
      500,
      "Internal server error: No aurora db name found in account"
    );
  }

  const tableName = getSkillDataTableName({
    skillDesignSlug: skill_design_slug,
    tableSlug: table_slug,
    sidebarSlug: sidebar_slug,
    type,
  });
  console.log("🚀 ~ file: updateSkillData.ts:69 ~ >= ~ tableName:", tableName);

  const skillDesign = await getFusion(skill_design_slug!, account.slug);

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
      (t) => t.slug === table_slug
    );

    if (!table) {
      throw createHttpError(404, `No table found with slug ${table_slug}`);
    }

    dataFields = table.fields?.fields || [];
  }

  const connection = await getAuroraConnection(auroraDbName);
  await healTable(connection, tableName, dataFields);
  const updates = Object.entries(fields || {}).reduce<string[]>(
    (acc, [key, value]) => {
      if (typeof value === "string") {
        acc.push(`\`${key}\` = '${value}'`);
      } else if (typeof value === "number") {
        acc.push(`\`${key}\` = ${value}`);
      } else if (typeof value === "boolean") {
        if (value) {
          acc.push(`\`${key}\` = TRUE`);
        } else {
          acc.push(`\`${key}\` = FALSE`);
        }
      } else if (typeof value === "object") {
        acc.push(`\`${key}\` = '${JSON.stringify(value)}'`);
      }
      return acc;
    },
    []
  );
  const idKey = getSkillRecordIdKey(tableName.slice(1, -1));
  console.log("🚀 ~ file: updateSkillData.ts:118 ~ >= ~ updates:", updates);
  if (updates.length > 0) {
    const sql = `UPDATE ${tableName} SET ${updates.join(
      ","
    )} WHERE \`${idKey}\` = '${slug}';`;
    console.log("🚀 ~ file: updateSkillData.ts:123 ~ >= ~ sql:", sql);

    await connection.execute(sql);
  }

  return {
    statusCode: 200,
    body: {
      message: "Update Successful",
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
