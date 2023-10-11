import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import S3 from "aws-sdk/clients/s3";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import _ from "lodash";
import {
  GFMLFunction,
  ThreePApp,
  ThreePAppConnection,
  ThreePAppModule,
  ThreePAppRemoteProcedure,
  ThreePAppWebhook,
} from "types";
import { v4 } from "uuid";
import { MEDIA_BUCKET_NAME, envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import getGuiFusionHttpApiUrl from "../../util/ssm/getGuiFusionHttpApiUrl";

const s3 = new S3();
const dynamodb = new DynamoDB.DocumentClient();

const threePAppsTableName = `${envTableNames.DYNAMODB_ACCT_3P_APPS}`;
const threePAppConnectionsTableName = `${envTableNames.DYNAMODB_ACCT_3P_APP_CONNECTIONS}`;
const threePAppWebhooksTableName = `${envTableNames.DYNAMODB_ACCT_3P_APP_WEBHOOKS}`;
const threePAppRPsTableName = `${envTableNames.DYNAMODB_ACCT_3P_APP_RPS}`;
const threePAppActionsTableName = `${envTableNames.DYNAMODB_ACCT_3P_ACTIONS}`;
const threePAppGFMLFunctionsTableName = `${envTableNames.DYNAMODB_ACCT_3P_APP_GFML_FUNCTIONS}`;
const BUCKET_NAME = MEDIA_BUCKET_NAME!;

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        filename: { type: "string" },
      },
      required: ["filename"],
    },
  },
  required: ["body"],
} as const;

type AppResources = {
  actions: ThreePAppModule[];
  connections: ThreePAppConnection[];
  webhooks: ThreePAppWebhook[];
  remoteProcedures: ThreePAppRemoteProcedure[];
  gfmlFunctions: GFMLFunction[];
};

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { filename } = event.body;
  const accountId: string = event.headers["account-id"] || "";

  if (!filename) {
    throw createHttpError(400, new Error("appUrl is required"), {
      expose: true,
    });
  }

  if (!accountId) {
    throw createHttpError(400, new Error("No account id found in headers"), {
      expose: true,
    });
  }

  const appFile = await s3
    .getObject({
      Bucket: BUCKET_NAME,
      Key: `${accountId}/uploads/${filename}`,
    })
    .promise();

  if (!appFile.Body) {
    throw createHttpError(400, new Error("No body found in file"), {
      expose: true,
    });
  }

  try {
    const appData: ThreePApp & { resources: AppResources } = JSON.parse(
      Buffer.from(appFile.Body as Buffer).toString("utf8")
    );

    const { resources, ...app } = appData;

    const newApp = await createApp(accountId, app, resources);
    return {
      statusCode: 200,
      body: { message: "App imported successfully", data: newApp },
    };
  } catch (e) {
    throw createHttpError(400, new Error("Failed to parse file"), {
      expose: true,
    });
  }
};

const createApp = async (
  accountId: string,
  app: ThreePApp,
  resources: AppResources
) => {
  const appSlug = `${app.app_name}:${v4()}`;
  const now = new Date().toISOString();

  console.log("creating app: ", app.slug);
  const tableParams = {
    TableName: threePAppsTableName,
    Item: {
      ...app,
      id: `3p:${accountId}:3p_apps`,
      slug: appSlug,
      is_deleted: 0,
      created_at: now,
      updated_at: null,
    },
  };
  await createAppResources(accountId, app, appSlug, resources);
  try {
    await dynamodb.put(tableParams).promise();
    return tableParams.Item;
  } catch (err) {
    throw new Error(`Error creating app ${app.app_name}`);
  }
};

const createAppResources = async (
  accountId: string,
  app: ThreePApp,
  appSlug: string,
  resources: AppResources
) => {
  let errorMessage = "";
  const {
    actions = [],
    webhooks = [],
    connections = [],
    remoteProcedures = [],
    gfmlFunctions = [],
  } = resources;
  try {
    errorMessage = `Error creating app connections ${app.app_name}`;
    const { failedConnections, connectionMapping } = await createConnections(
      accountId,
      appSlug,
      connections
    );

    errorMessage = `Error creating app webhooks ${app.app_name}`;
    const failedWebhooks = await createWebhooks(
      accountId,
      appSlug,
      connectionMapping,
      webhooks
    );

    errorMessage = `Error creating app remote procedures ${app.app_name}`;
    const failedRPs = await createRemoteProcedures(
      accountId,
      appSlug,
      connectionMapping,
      remoteProcedures
    );

    errorMessage = `Error creating app modules ${app.app_name}`;
    const failedModules = await createModules(
      accountId,
      appSlug,
      connectionMapping,
      actions
    );

    errorMessage = `Error creating GFML functions ${app.app_name}`;
    const failedGFMLFunctions = await createGFMLFunctions(
      accountId,
      appSlug,
      gfmlFunctions
    );

    return {
      failedConnections,
      failedWebhooks,
      failedRPs,
      failedModules,
      failedGFMLFunctions,
    };
  } catch (err) {
    throw new Error(`${errorMessage}; ${(err as Error).message}`);
  }
};

const createConnections = async (
  accountId: string,
  appSlug: string,
  connections: ThreePAppConnection[]
) => {
  const failedConnections = [];
  const connectionMapping: Record<string, string> = {};

  for (const connection of connections) {
    try {
      console.log("creating connection: ", connection.slug);
      const now = new Date().toISOString();

      const connectionSlug = `${appSlug}:${v4()}`;

      const tableParams = {
        TableName: threePAppConnectionsTableName,
        Item: {
          ...connection,
          id: `${accountId}:3p_app_connections`,
          slug: connectionSlug,
          is_deleted: false,
          created_at: now,
          updated_at: now,
        },
      };
      await dynamodb.put(tableParams).promise();
      _.set(connectionMapping, connection.slug, connectionSlug);
    } catch (err) {
      console.log(`Connection Error: ${connection.slug} ${err}`);
      failedConnections.push({
        slug: connection.slug,
        error: (err as Error).message,
      });
    }
  }

  console.log("connectionMapping: ", connectionMapping);

  return { failedConnections, connectionMapping };
};

const createWebhooks = async (
  accountId: string,
  appSlug: string,
  connectionMapping: Record<string, string>,
  webhooks: ThreePAppWebhook[]
) => {
  const GUI_FUSION_API_URL = await getGuiFusionHttpApiUrl();
  const failedWebhooks = [];

  for (const webhook of webhooks) {
    try {
      console.log("creating webhook: ", webhook.slug);
      const now = new Date().toISOString();
      const webhookSlug = `${appSlug}:${v4()}`;

      let uuid = "",
        shared_url_address = "";
      if (webhook.webhook_type === "shared") {
        uuid = v4().replace(/-/g, "");
        shared_url_address =
          shared_url_address = `${GUI_FUSION_API_URL}/fusion/webhook/shared/${accountId}?id=${uuid}`;
      }

      const tableParams = {
        TableName: threePAppWebhooksTableName,
        Item: {
          ...webhook,
          id: `${accountId}:3p_app_webhooks`,
          slug: webhookSlug,
          connection_id: connectionMapping[webhook.connection_id],
          alt_connection_id: connectionMapping[webhook.alt_connection_id] || "",
          shared_url_address: shared_url_address,
          shared_url_uuid: uuid,
          is_deleted: false,
          created_at: now,
          updated_at: now,
        },
      };
      await dynamodb.put(tableParams).promise();
    } catch (err) {
      console.log(`Webhook Error: ${webhook.slug} ${err}`);
      failedWebhooks.push({
        slug: webhook.slug,
        error: (err as Error).message,
      });
    }
  }

  return failedWebhooks;
};

const createRemoteProcedures = async (
  accountId: string,
  appSlug: string,
  connectionMapping: Record<string, string>,
  rps: ThreePAppRemoteProcedure[]
) => {
  const failedRPs = [];

  for (const rp of rps) {
    try {
      console.log("creating rp: ", rp.slug);
      const now = new Date().toISOString();
      const rpSlug = `${appSlug}:${v4()}`;

      const tableParams = {
        TableName: threePAppRPsTableName,
        Item: {
          ...rp,
          id: `${accountId}:3p_app_rp`,
          slug: rpSlug,
          connection_id: connectionMapping[rp.connection_id],
          alt_connection_id: connectionMapping[rp.alt_connection_id],

          is_deleted: false,
          created_at: now,
          updated_at: now,
        },
      };
      await dynamodb.put(tableParams).promise();
    } catch (err) {
      console.log(`RP Error: ${rp.slug} ${err}`);
      failedRPs.push({
        slug: rp.slug,
        error: (err as Error).message,
      });
    }
  }

  return failedRPs;
};

const createModules = async (
  accountId: string,
  appSlug: string,
  connectionMapping: Record<string, string>,
  modules: ThreePAppModule[]
) => {
  const failedModules = [];

  for (const module of modules) {
    try {
      console.log("creating module: ", module.slug);
      const now = new Date().toISOString();
      const moduleSlug = `${appSlug}:${v4()}`;

      const tableParams = {
        TableName: threePAppActionsTableName,
        Item: {
          ...module,
          id: `${accountId}:3p_app_actions`,
          slug: moduleSlug,
          connection_id: connectionMapping[module.connection_id],
          alt_connection_id: connectionMapping[module.alt_connection_id],
          is_deleted: false,
          created_at: now,
          updated_at: now,
        },
      };
      await dynamodb.put(tableParams).promise();
    } catch (err) {
      console.log(`Module Error: ${module.slug} ${err}`);
      failedModules.push({
        slug: module.slug,
        error: (err as Error).message,
      });
    }
  }

  return failedModules;
};

const createGFMLFunctions = async (
  accountId: string,
  appSlug: string,
  gfmlFunctions: GFMLFunction[]
) => {
  const failedGFMLFunctions = [];

  for (const func of gfmlFunctions) {
    try {
      console.log("creating gfml function: ", func.slug);
      const now = new Date().toISOString();
      const funcSlug = `${appSlug}:${func.function_slug}`;

      const tableParams = {
        TableName: threePAppGFMLFunctionsTableName,
        Item: {
          ...func,
          id: `${accountId}:3p_gfml_functions`,
          slug: funcSlug,
          is_deleted: false,
          created_at: now,
          updated_at: now,
        },
      };
      await dynamodb.put(tableParams).promise();
    } catch (err) {
      console.log(`GFML function Error: ${func.slug} ${err}`);
      failedGFMLFunctions.push({
        slug: func.slug,
        error: (err as Error).message,
      });
    }
  }

  return failedGFMLFunctions;
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
  .use(
    httpResponseSerializer({
      serializers: [
        {
          regex: /^application\/json$/,
          serializer: ({ body }: any) => JSON.stringify(body),
        },
      ],
      defaultContentType: "application/json",
    })
  ) // handles common http errors and returns proper responses
  .handler(lambdaHandler);
