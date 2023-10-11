import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import createHttpError from "http-errors";
import { getAuroraConnection } from "../../helpers/db/aurora";
import { getSkillDataTableName } from "../../helpers/skillData";
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
  try {
    console.log(
      "🚀 ~ file: listSkillData.ts:25 ~ >= ~ event:",
      JSON.stringify(event, null, 2)
    );
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
      "🚀 ~ file: listSkillData.ts:30 ~ >= ~ auroraDbName:",
      auroraDbName
    );

    const { skill_design_slug, table_slug, sidebar_slug, type } =
      event.queryStringParameters || {};

    const tableName = getSkillDataTableName({
      skillDesignSlug: skill_design_slug,
      tableSlug: table_slug,
      sidebarSlug: sidebar_slug,
      type,
    });

    const connection = await getAuroraConnection(auroraDbName);

    const sql = `SELECT * FROM ${tableName};`;

    console.log("🚀 ~ file: listSkillData.ts:58 ~ >= ~ sql:", sql);
    const [data] = await connection.execute(sql);
    console.log("🚀 ~ file: listSkillData.ts:60 ~ >= ~ data:", data);

    return {
      statusCode: 200,
      body: { data },
    };
  } catch (e) {
    console.log("🚀 ~ file: listSkillData.ts:65 ~ >= ~ e:", e);
    return {
      statusCode: 200,
      body: { data: [], e },
    };
  }
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
