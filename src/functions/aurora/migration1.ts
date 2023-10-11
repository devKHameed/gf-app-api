import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import AWS from "aws-sdk";
import { AWSError } from "aws-sdk/lib/error";
import {
  default as createError,
  default as createHttpError,
} from "http-errors";
import knex from "knex";

import jsonBodyParser from "@middy/http-json-body-parser";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { DB_ENDPOINT, SECRET_NAME, TRANSACTION_HISTORY } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import getAccount from "../../util/getAccount";
const secretsManager = new AWS.SecretsManager();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        account_id: {
          type: "string",
        },
      },
    },
  },
  required: ["account_id"], // Insert here all required event properties
} as const;

export const RequsetCreateGFContactBody = {
  title: "RequsetCreateGFContactBody",
  RequsetCreateGFContactBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const accountId = event.body?.account_id as string;
  console.log("accountId----", accountId);
  const account = await getAccount(accountId);

  console.log("account-------", account);
  if (!account) throw createHttpError("invalid params");

  const databaseName = account?.database_name;
  console.log("databaseName", databaseName);
  try {
    const secret = await secretsManager
      .getSecretValue({ SecretId: SECRET_NAME })
      .promise();

    if (!secret.SecretString) throw "secret manager error";
    const { username, password } = JSON.parse(secret.SecretString);

    const knexConnection = knex({
      client: "mysql2",
      connection: {
        host: DB_ENDPOINT,
        user: username,
        database: databaseName,
        password: password,
      },
    });

    // await knexConnection.schema
    //   .createTable(ACCOUNT_GF_CONTACTS_TABLE_NAME, function (table) {
    //     table.string("slug").primary();
    //     table.string("id");
    //     table.string("dynamo_id");
    //     table.string("primary_email");
    //     table.string("primary_phone");
    //     table.string("first_name");
    //     table.string("last_name");
    //     table.json("all_emails");
    //     table.json("all_phones");
    //     table.string("country").defaultTo("");
    //     table.string("profile_image").defaultTo("");
    //     table.json("mailing_address");
    //     table.boolean("is_universal").defaultTo(false);
    //     table.boolean("is_deleted").defaultTo(false);
    //     table.boolean("is_active").defaultTo(false);
    //     table.timestamps(true, true);
    //   })
    //   .then(() => console.log("contacts created"));

    // await knexConnection.schema
    //   .createTable(ACCOUNT_GF_WORKFLOW_SESSIONS_TABLE_NAME, function (table) {
    //     table.string("slug").primary();
    //     table.string("id");
    //     table.string("workflow_type_id");
    //     table.string("name");
    //     table.string("description");
    //     table.json("session_roles");
    //     table.string("session_body").defaultTo("");
    //     table.string("session_stage").defaultTo("");
    //     table.json("session_fields");
    //     table.json("session_history");
    //     table.boolean("is_deleted").defaultTo(false);
    //     table.boolean("is_active").defaultTo(false);
    //     table.timestamps(true, true);
    //   })
    //   .then(() => console.log("table created"));

    // await knexConnection.schema
    //   .alterTable(ACCOUNT_GF_WORKFLOW_SESSIONS_TABLE_NAME, function (table) {
    //     table.index("workflow_type_id");
    //   })
    //   .then(() => console.log("Index was created!"));

    // await knexConnection.schema
    //   .createTable(
    //     ACCOUNT_GF_WORKFLOWS_SESSION_TAG_TABLE_NAME,
    //     function (table) {
    //       table.increments("slug").primary();
    //       table.string("workflow_session_id").notNullable();
    //       table
    //         .foreign("workflow_session_id")
    //         .references(`${ACCOUNT_GF_WORKFLOW_SESSIONS_TABLE_NAME}.slug`);
    //       table.string("tag_value").notNullable();
    //     }
    //   )
    //   .then(() => console.log("Table created"))
    //   .catch((err) => {
    //     console.log(err);
    //     throw err;
    //   });

    // await knexConnection.schema
    //   .createTable(ACCOUNT_GF_CONTACT_TAGS_TABLE_NAME, function (table) {
    //     table.increments("slug").primary();
    //     table.string("contact_id").notNullable();
    //     table
    //       .foreign("contact_id")
    //       .references(`${ACCOUNT_GF_CONTACTS_TABLE_NAME}.slug`);
    //     table.string("tag_value").notNullable();
    //   })
    //   .then(() => console.log("Table created"))
    //   .catch((err) => {
    //     console.log(err);
    //     throw err;
    //   });

    ///------------------------------

    // await knexConnection.schema.createTable(
    //   ACCOUNT_DATASET_DESIGN_TABLE_NAME,
    //   (table) => {
    //     table.string("id");
    //     table.string("slug").primary();
    //     table.string("dataset_slug");
    //     table.string("name");
    //     table.string("parent_type");
    //     table.string("parent_id");
    //     table.string("color");
    //     table.json("fields");
    //     table.string("sql_table_name");
    //     table.boolean("is_active");
    //     table.boolean("is_deleted");
    //     table.timestamps(true, true);
    //   }
    // );

    // await knexConnection.schema.createTable(
    //   ACCOUNT_SKILL_SESSION_TABLE_NAME,
    //   function (table) {
    //     table.increments("session_id").primary();
    //     table.string("account_id").notNullable();
    //     table.string("user_id").notNullable();
    //     table.string("skill_id").notNullable();
    //     table.dateTime("start_date_time").notNullable();
    //     table.dateTime("end_date_time");
    //     table.enu("status", ["Open", "Closed"]).notNullable();
    //     table.text("note");
    //   }
    // );

    // await knexConnection.schema.createTable(
    //   ACCOUNT_JOB_SESSION_TABLE_NAME,
    //   function (table) {
    //     table.increments("session_id").primary();
    //     table.string("account_id").notNullable();
    //     table.string("user_id").notNullable();
    //     table.string("related_skill_id").notNullable();
    //     table.dateTime("start_date_time").notNullable();
    //     table.dateTime("end_date_time");
    //     table.enu("status", ["Open", "Closed", "Awaiting Instruction"]).notNullable();
    //     table.string("title");
    //     table.text("note");
    //   }
    // );

    await knexConnection.schema
      .createTable("media", (table) => {
        table.increments("id").primary();
        table.string("media_type");
        table.timestamps(true, true);
        table.string("title");
        table.string("description");
        table.string("tags");
        table.string("s3_path");
        table.boolean("upload_complete").defaultTo(false);
        table
          .integer("parent_id")
          .after("upload_complete")
          .unsigned()
          .defaultTo(null);
        table.string("path");
        table.tinyint("is_favorite").defaultTo(0);
        table.tinyint("is_deleted").defaultTo(0);
        table
          .foreign("parent_id", "fk_media_parent_id")
          .references("id")
          .inTable("media");
        table.index("s3_path", "idx_media_s3_path");
      })
      .then(() => {
        console.log("Media table created successfully.");
      });

    await knexConnection.schema
      .createTable(TRANSACTION_HISTORY, (table) => {
        table.increments("id").primary();
        table.string("title");
        table.string("description");
        table.double("credited");
        table.double("debited");
        table.string("credit_type_id");
        table.string("package_id");
        table.timestamps(true, true);
      })
      .then(() => {
        console.log("Media table created successfully.");
      });

    await knexConnection
      .raw("SHOW tables")
      .then((databases) => {
        console.log(databases);
      })
      .catch((error) => {
        console.error(error);
      });
    return {
      statusCode: 200,
      body: { message: "successfully magration v1 successfull" },
    };
  } catch (error: unknown) {
    console.log("error", error);
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
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
