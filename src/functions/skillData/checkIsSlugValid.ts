import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
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
      properties: {
        skill_design_slug: {
          type: "string",
        },
        type: {
          type: "string",
          enum: ["table", "sidebar"],
        },
        slug: {
          type: "string",
        },
        module_slug: {
          type: "string",
        },
      },
      required: ["skill_design_slug", "type", "slug", "module_slug"],
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { skill_design_slug, type, slug, module_slug } = event.body;
  console.log(
    "🚀 ~ file: checkIsSlugValid.ts:42 ~ >= ~ event.body:",
    event.body
  );

  const account = event.account as Account;

  if (!account.database_name) {
    throw createHttpError(500, "Invalid DB name");
  }

  const connection = await getAuroraConnection(account.database_name);

  const [tables] = await connection.execute(`
    SELECT TABLE_NAME AS table_name, GROUP_CONCAT(COLUMN_NAME) AS column_names 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = '${account.database_name}' 
    GROUP BY TABLE_NAME;
  `);
  console.log(
    "🚀 ~ file: checkIsSlugValid.ts:63 ~ >= ~ tables:",
    JSON.stringify(tables, null, 2)
  );

  const tableName = getSkillDataTableName({
    skillDesignSlug: skill_design_slug,
    type,
    tableSlug: `${module_slug}.${slug}`,
    sidebarSlug: `${module_slug}.${slug}`,
  });
  console.log(
    "🚀 ~ file: checkIsSlugValid.ts:70 ~ >= ~ tableName:",
    tableName.slice(1, -1)
  );

  const isTableExists = (tables as { table_name: string }[]).some(
    (table) => table.table_name === tableName.slice(1, -1)
  );

  return {
    statusCode: 200,
    body: { is_valid: isTableExists },
  };
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
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
