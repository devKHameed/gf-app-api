// import some middlewares
import { STS, SecretsManager } from "aws-sdk";
import createHttpError from "http-errors";
import knex from "knex";
import {
  ACCT_NAME,
  DB_ENDPOINT,
  MAIN_ACCT_ACCESS_ROLE_ARN,
  MAIN_ACCT_ACCESS_ROLE_SESSION_NAME,
  REGION,
  SECRET_NAME,
} from "../../config";
// const secretsManager = new AWS.SecretsManager();

const connectKnex = async (databaseName?: string) => {
  try {
    console.log("connectKnex");
    let secretsManager = new SecretsManager({ region: REGION });
    if (ACCT_NAME !== "main") {
      const stsClient = new STS();
      const stsSession = await stsClient
        .assumeRole({
          RoleArn: MAIN_ACCT_ACCESS_ROLE_ARN!,
          RoleSessionName: MAIN_ACCT_ACCESS_ROLE_SESSION_NAME!,
        })
        .promise();

      if (!stsSession.Credentials) {
        throw new Error("Could not assume role");
      }

      const { AccessKeyId, SecretAccessKey, SessionToken } =
        stsSession.Credentials;

      secretsManager = new SecretsManager({
        credentials: {
          accessKeyId: AccessKeyId,
          secretAccessKey: SecretAccessKey,
          sessionToken: SessionToken,
        },
        region: REGION,
      });
    }
    const secret = await secretsManager
      .getSecretValue({ SecretId: SECRET_NAME })
      .promise();
    console.log("getSecretValue");
    if (!secret.SecretString) throw "secret manager error";
    const { username, password } = JSON.parse(secret.SecretString);

    console.log("connecting mysql2");
    const knexConnection = knex({
      client: "mysql2",
      connection: {
        host: DB_ENDPOINT,
        user: username,
        database: databaseName,
        password: password,
      },
    });
    console.log("connecting success");
    return knexConnection;
  } catch (error: unknown) {
    console.log("error", error);
    const err = error as Error;
    throw createHttpError(err.message);
  }
};

export default connectKnex;
