import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import createHttpError from "http-errors";
import { getAuroraConnection } from "../../helpers/db/aurora";
import {
  getSkillDataTableName,
  getSkillRecordIdKey,
} from "../../helpers/skillData";
import type { ValidatedEventAPIGatewayProxyEvent } from "../../lib/apiGateway";
import getAccountData from "../../middleware/getAccountData";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { Account } from "../../types";

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  console.log(
    "🚀 ~ file: removeSkillData.ts:25 ~ >= ~ event:",
    JSON.stringify(event, null, 2)
  );
  const { slug } = event.pathParameters || {};
  if (!slug) {
    console.log("No slug");
    throw createHttpError(400, "Missing slug");
  }

  const account = event.account as Account;
  const auroraDbName = account.database_name;
  console.log(
    "🚀 ~ file: removeSkillData.ts:33 ~ >= ~ auroraDbName:",
    auroraDbName
  );

  if (!auroraDbName) {
    console.log("No aurora db name found in account");
    throw createHttpError(
      500,
      "Internal server error: No aurora db name found in account"
    );
  }

  const { skill_design_slug, table_slug, sidebar_slug, type } =
    event.queryStringParameters || {};

  const tableName = getSkillDataTableName({
    skillDesignSlug: skill_design_slug,
    tableSlug: table_slug,
    sidebarSlug: sidebar_slug,
    type,
  });

  const connection = await getAuroraConnection(auroraDbName);

  const idKey = getSkillRecordIdKey(tableName.slice(1, -1));

  const sql = `DELETE FROM ${tableName} WHERE \`${idKey}\` = '${slug}';`;

  console.log("🚀 ~ file: removeSkillData.ts:57 ~ >= ~ sql:", sql);
  await connection.execute(sql);

  return {
    statusCode: 200,
    body: { message: "Delete Successful" },
  };
};

export const handler = middy()
  .use(getAccountData())
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
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
  .handler(lambdaHandler);
