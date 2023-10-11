import { STS, SecretsManager } from "aws-sdk";
import mysql from "mysql2/promise";
import {
  ACCT_NAME,
  DB_ENDPOINT,
  MAIN_ACCT_ACCESS_ROLE_ARN,
  MAIN_ACCT_ACCESS_ROLE_SESSION_NAME,
  REGION,
  SECRET_NAME,
} from "../../../config";
const stsClient = new STS();

export const getAuroraConnection = async (databaseName?: string) => {
  let secretsManager = new SecretsManager({ region: REGION });
  if (ACCT_NAME !== "main") {
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

  if (!secret.SecretString) throw new Error("No SecretString");
  const { username, password } = JSON.parse(secret.SecretString);
  console.log({
    host: DB_ENDPOINT,
    user: username,
    database: databaseName,
    password: password,
  });

  const connection = await mysql.createConnection({
    host: DB_ENDPOINT,
    user: username,
    database: databaseName,
    password: password,
  });

  return connection;
};
