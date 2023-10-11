import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import AWS from "aws-sdk";
import { AWSError } from "aws-sdk/lib/error";
import { default as createError } from "http-errors";
import knex from "knex";

import jsonBodyParser from "@middy/http-json-body-parser";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { AccountCredit } from "types";
import { ACCOUNT_CREDIT, DB_ENDPOINT, SECRET_NAME } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
const secretsManager = new AWS.SecretsManager();

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const databaseName = "gfcore9";
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

    const data = await knexConnection<AccountCredit>(ACCOUNT_CREDIT);

    // const data = await knexConnection
    //   .select()
    //   .table(ACCOUNT_GF_CONTACTS_TABLE_NAME)

    //   .catch((err) => {
    //     console.log(err);
    //     throw err;
    //   });

    // await knexConnection
    //   .raw(`DESCRIBE ${ACCOUNT_GF_CONTACTS_TABLE_NAME}`)
    //   .then((result) => {
    //     console.log(result);
    //   })
    //   .catch((err) => {
    //     console.log(err);
    //     throw err;
    //   });

    // .finally(() => {
    //   knexConnection.destroy();
    // });
    // await knexConnection
    //   .raw("SHOW tables")
    //   .then((databases) => {
    //     console.log(databases);
    //   })
    //   .catch((error) => {
    //     console.error(error);
    //   });
    return {
      statusCode: 200,
      body: { message: "successfully test", data: data },
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
