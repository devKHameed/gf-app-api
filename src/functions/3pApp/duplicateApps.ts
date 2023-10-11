import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import _ from "lodash";
import { v4 } from "uuid";
import { envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import {
  GFMLFunction,
  ThreePApp,
  ThreePAppConnection,
  ThreePAppModule,
  ThreePAppRemoteProcedure,
  ThreePAppWebhook,
} from "../../types";
import getGuiFusionHttpApiUrl from "../../util/ssm/getGuiFusionHttpApiUrl";

const dynamodb = new DynamoDB.DocumentClient();

const accountId = "08dc6f6b-b6e9-4e14-870b-02cbeb5da007";
const newAccountId = "3p:08dc6f6b-b6e9-4e14-870b-02cbeb5da007";
const threePAppsTableName = `${envTableNames.DYNAMODB_ACCT_3P_APPS}`;
const threePAppConnectionsTableName = `${envTableNames.DYNAMODB_ACCT_3P_APP_CONNECTIONS}`;
const threePAppWebhooksTableName = `${envTableNames.DYNAMODB_ACCT_3P_APP_WEBHOOKS}`;
const threePAppRPsTableName = `${envTableNames.DYNAMODB_ACCT_3P_APP_RPS}`;
const threePAppActionsTableName = `${envTableNames.DYNAMODB_ACCT_3P_ACTIONS}`;
const threePAppGFMLFunctionsTableName = `${envTableNames.DYNAMODB_ACCT_3P_APP_GFML_FUNCTIONS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  unknown
> = async () => {
  const errors: any[] = [];

  let failedFunctions, failedResources;

  const data = await dynamodb
    .query({
      TableName: threePAppsTableName,
      KeyConditionExpression: "#id = :id",
      FilterExpression: "#is_deleted = :is_deleted",
      ExpressionAttributeNames: {
        "#is_deleted": "is_deleted",
        "#id": "id",
      },
      ExpressionAttributeValues: {
        ":is_deleted": false,
        ":id": `${accountId}:3p_apps`,
      },
    })
    .promise();

  console.log("apps found: ", data.Count);

  if (!data.Items?.length) {
    return {
      statusCode: 404,
      body: "No apps found",
    };
  }

  for (const app of data.Items) {
    try {
      failedResources = await createApp(app as ThreePApp);
    } catch (err) {
      console.log("App Slug: ", app.slug);
      console.log("Error:", err);
      errors.push({ appSlug: app.slug, error: (err as Error).message });
    }
  }

  // await deleteItems();

  return {
    statusCode: 200,
    body: { errors, failedResources, failedFunctions },
  };
  // throw createHttpError(500, e as Error, { expose: true });
};

const deleteItems = async () => {
  const { Items: conns = [] } = await dynamodb
    .query({
      TableName: threePAppConnectionsTableName,
      KeyConditionExpression: "#id = :id",
      FilterExpression: "#is_deleted = :is_deleted",
      ExpressionAttributeNames: {
        "#is_deleted": "is_deleted",
        "#id": "id",
      },
      ExpressionAttributeValues: {
        ":id": `${newAccountId}:3p_app_connections`,
        ":is_deleted": false,
      },
    })
    .promise();
  console.log(
    "🚀 ~ file: appMigration.ts ~ line 157 ~ deleteItems ~ conns",
    conns.length
  );
  for (const item of conns) {
    await dynamodb
      .delete({
        TableName: threePAppConnectionsTableName,
        Key: {
          id: item.id,
          slug: item.slug,
        },
      })
      .promise();
  }
  const { Items: webhooks = [] } = await dynamodb
    .query({
      TableName: threePAppWebhooksTableName,
      KeyConditionExpression: "#id = :id",
      FilterExpression: "#is_deleted = :is_deleted",
      ExpressionAttributeNames: {
        "#is_deleted": "is_deleted",
        "#id": "id",
      },
      ExpressionAttributeValues: {
        ":id": `${newAccountId}:3p_app_webhooks`,
        ":is_deleted": false,
      },
    })
    .promise();
  console.log(
    "🚀 ~ file: appMigration.ts ~ line 184 ~ deleteItems ~ webhooks",
    webhooks.length
  );
  for (const item of webhooks) {
    await dynamodb
      .delete({
        TableName: threePAppWebhooksTableName,
        Key: {
          id: item.id,
          slug: item.slug,
        },
      })
      .promise();
  }
  const { Items: rps = [] } = await dynamodb
    .query({
      TableName: threePAppRPsTableName,
      KeyConditionExpression: "#id = :id",
      FilterExpression: "#is_deleted = :is_deleted",
      ExpressionAttributeNames: {
        "#is_deleted": "is_deleted",
        "#id": "id",
      },
      ExpressionAttributeValues: {
        ":id": `${newAccountId}:3p_app_rp`,
        ":is_deleted": false,
      },
    })
    .promise();
  console.log(
    "🚀 ~ file: appMigration.ts ~ line 211 ~ deleteItems ~ rps",
    rps.length
  );
  for (const item of rps) {
    await dynamodb
      .delete({
        TableName: threePAppRPsTableName,
        Key: {
          id: item.id,
          slug: item.slug,
        },
      })
      .promise();
  }
  const { Items: actions = [] } = await dynamodb
    .query({
      TableName: threePAppActionsTableName,
      KeyConditionExpression: "#id = :id",
      FilterExpression: "#is_deleted = :is_deleted",
      ExpressionAttributeNames: {
        "#is_deleted": "is_deleted",
        "#id": "id",
      },
      ExpressionAttributeValues: {
        ":id": `${newAccountId}:3p_app_actions`,
        ":is_deleted": false,
      },
    })
    .promise();
  console.log(
    "🚀 ~ file: appMigration.ts ~ line 238 ~ deleteItems ~ actions",
    actions.length
  );
  for (const item of actions) {
    await dynamodb
      .delete({
        TableName: threePAppActionsTableName,
        Key: {
          id: item.id,
          slug: item.slug,
        },
      })
      .promise();
  }

  const { Items: funcs = [] } = await dynamodb
    .query({
      TableName: threePAppGFMLFunctionsTableName,
      KeyConditionExpression: "#id = :id",
      FilterExpression: "#is_deleted = :is_deleted",
      ExpressionAttributeNames: {
        "#is_deleted": "is_deleted",
        "#id": "id",
      },
      ExpressionAttributeValues: {
        ":id": `${newAccountId}:3p_gfml_functions`,
        ":is_deleted": false,
      },
    })
    .promise();
  console.log(
    "🚀 ~ file: appMigration.ts ~ line 266 ~ deleteItems ~ funcs",
    funcs.length
  );
  for (const item of funcs) {
    await dynamodb
      .delete({
        TableName: threePAppGFMLFunctionsTableName,
        Key: {
          id: item.id,
          slug: item.slug,
        },
      })
      .promise();
  }
};

const createApp = async (app: ThreePApp) => {
  const appSlug = `current:${app.app_name}:${v4()}`;
  const now = new Date().toISOString();

  try {
    console.log("creating app: ", app.slug);
    const tableParams = {
      TableName: threePAppsTableName,
      Item: {
        ...app,
        id: `${newAccountId}:3p_apps`,
        slug: appSlug,
        is_active: 1,
        is_deleted: 0,
        created_at: now,
        updated_at: null,
      },
    };

    await dynamodb.put(tableParams).promise();
  } catch (err) {
    throw new Error(`Error creating app ${app.app_name}`);
  }

  return await createAppResources(app, appSlug);
};

const createAppResources = async (app: ThreePApp, appSlug: string) => {
  let errorMessage = "";
  try {
    errorMessage = `Error creating app connections ${app.app_name}`;
    const { failedConnections, connectionMapping } = await createConnections(
      app,
      appSlug
    );

    errorMessage = `Error creating app webhooks ${app.app_name}`;
    const failedWebhooks = await createWebhooks(
      app,
      appSlug,
      connectionMapping
    );

    errorMessage = `Error creating app remote procedures ${app.app_name}`;
    const failedRPs = await createRemoteProcedures(
      app,
      appSlug,
      connectionMapping
    );

    errorMessage = `Error creating app modules ${app.app_name}`;
    const failedModules = await createModules(app, appSlug, connectionMapping);

    errorMessage = `Error creating GFML functions ${app.app_name}`;
    const failedGFMLFunctions = await createGFMLFunctions(app, appSlug);

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

const createConnections = async (app: ThreePApp, appSlug: string) => {
  const failedConnections = [];
  let connections: ThreePAppConnection[] = [];
  const connectionMapping: Record<string, string> = {};

  try {
    console.log("getting connections: ", app.slug);
    const { Items = [] } = await dynamodb
      .query({
        TableName: threePAppConnectionsTableName,
        KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
        FilterExpression: "#is_deleted = :is_deleted",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
          "#id": "id",
          "#slug": "slug",
        },
        ExpressionAttributeValues: {
          ":id": `${accountId}:3p_app_connections`,
          ":is_deleted": false,
          ":slug": app.slug,
        },
      })
      .promise();
    connections = Items as ThreePAppConnection[];
    console.log("Items: ", Items.length);
  } catch (err) {
    console.log(`Error getting connections for ${app.slug} ${err}`);
    failedConnections.push({
      slug: app.slug,
      error: (err as Error).message,
    });

    return { failedConnections, connectionMapping };
  }

  for (const connection of connections) {
    try {
      console.log("creating connection: ", connection.slug);
      const now = new Date().toISOString();

      const communication = connection.communication;
      if (_.has(communication, "authorize.qs.redirect_uri")) {
        _.set(
          communication,
          "authorize.qs.redirect_uri",
          "https://d3ep4wdyeggv8a.cloudfront.net/app/oauth_callback"
        );
      }

      if (_.has(communication, "token.body.redirect_uri")) {
        _.set(
          communication,
          "token.body.redirect_uri",
          "https://d3ep4wdyeggv8a.cloudfront.net/app/oauth_callback"
        );
      }

      const connectionSlug = `${appSlug}:${v4()}`;

      const tableParams = {
        TableName: threePAppConnectionsTableName,
        Item: {
          ...connection,
          id: `${newAccountId}:3p_app_connections`,
          slug: connectionSlug,
          communication,
          is_active: true,
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
  app: ThreePApp,
  appSlug: string,
  connectionMapping: Record<string, string>
) => {
  const GUI_FUSION_API_URL = await getGuiFusionHttpApiUrl();
  const failedWebhooks = [];
  let webhooks: ThreePAppWebhook[] = [];

  try {
    console.log("getting webhooks: ", app.slug);
    const { Items = [] } = await dynamodb
      .query({
        TableName: threePAppWebhooksTableName,
        KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
        FilterExpression: "#is_deleted = :is_deleted",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
          "#id": "id",
          "#slug": "slug",
        },
        ExpressionAttributeValues: {
          ":id": `${accountId}:3p_app_webhooks`,
          ":is_deleted": false,
          ":slug": app.slug,
        },
      })
      .promise();
    webhooks = Items as ThreePAppWebhook[];
    console.log("Items: ", Items.length);
  } catch (err) {
    console.log(`Error getting webhooks for ${app.slug} ${err}`);
    failedWebhooks.push({
      slug: app.slug,
      error: (err as Error).message,
    });

    return failedWebhooks;
  }

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
          shared_url_address = `${GUI_FUSION_API_URL}/fusion/webhook/shared/${accountId}/${uuid}`;
      }

      const tableParams = {
        TableName: threePAppWebhooksTableName,
        Item: {
          ...webhook,
          id: `${newAccountId}:3p_app_webhooks`,
          slug: webhookSlug,
          connection_id: connectionMapping[webhook.connection_id],
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
  app: ThreePApp,
  appSlug: string,
  connectionMapping: Record<string, string>
) => {
  const failedRPs = [];
  let rps: ThreePAppRemoteProcedure[] = [];

  try {
    console.log("getting rps: ", app.slug);
    const { Items = [] } = await dynamodb
      .query({
        TableName: threePAppRPsTableName,
        KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
        FilterExpression: "#is_deleted = :is_deleted",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
          "#id": "id",
          "#slug": "slug",
        },
        ExpressionAttributeValues: {
          ":id": `${accountId}:3p_app_rp`,
          ":is_deleted": false,
          ":slug": app.slug,
        },
      })
      .promise();
    rps = Items as ThreePAppRemoteProcedure[];
    console.log("Items: ", Items.length);
  } catch (err) {
    console.log(`Error getting rps for ${app.slug} ${err}`);
    failedRPs.push({
      slug: app.slug,
      error: (err as Error).message,
    });

    return failedRPs;
  }

  for (const rp of rps) {
    try {
      console.log("creating rp: ", rp.slug);
      const now = new Date().toISOString();
      const rpSlug = `${appSlug}:${v4()}`;

      const tableParams = {
        TableName: threePAppRPsTableName,
        Item: {
          ...rp,
          id: `${newAccountId}:3p_app_rp`,
          slug: rpSlug,
          connection_id: connectionMapping[rp.connection_id],
          is_active: true,
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
  app: ThreePApp,
  appSlug: string,
  connectionMapping: Record<string, string>
) => {
  const failedModules = [];
  let modules: ThreePAppModule[] = [];

  try {
    console.log("getting modules: ", app.slug);
    const { Items = [] } = await dynamodb
      .query({
        TableName: threePAppActionsTableName,
        KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
        FilterExpression: "#is_deleted = :is_deleted",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
          "#id": "id",
          "#slug": "slug",
        },
        ExpressionAttributeValues: {
          ":id": `${accountId}:3p_app_actions`,
          ":is_deleted": false,
          ":slug": app.slug,
        },
      })
      .promise();
    modules = Items as ThreePAppModule[];
    console.log("Items: ", Items.length);
  } catch (err) {
    console.log(`Error getting modules for ${app.slug} ${err}`);
    failedModules.push({
      slug: app.slug,
      error: (err as Error).message,
    });

    return failedModules;
  }

  for (const module of modules) {
    try {
      console.log("creating module: ", module.slug);
      const now = new Date().toISOString();
      const moduleSlug = `${appSlug}:${v4()}`;

      const tableParams = {
        TableName: threePAppActionsTableName,
        Item: {
          ...module,
          id: `${newAccountId}:3p_app_actions`,
          slug: moduleSlug,
          connection_id: connectionMapping[module.connection_id],
          is_active: true,
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

const createGFMLFunctions = async (app: ThreePApp, appSlug: string) => {
  const failedGFMLFunctions = [];
  let gfmlFunctions: GFMLFunction[] = [];

  try {
    console.log("getting gfml functions: ", app.slug);
    const { Items = [] } = await dynamodb
      .query({
        TableName: threePAppGFMLFunctionsTableName,
        KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
        FilterExpression: "#is_deleted = :is_deleted",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
          "#id": "id",
          "#slug": "slug",
        },
        ExpressionAttributeValues: {
          ":id": `${accountId}:3p_gfml_functions`,
          ":is_deleted": false,
          ":slug": app.slug,
        },
      })
      .promise();
    gfmlFunctions = Items as GFMLFunction[];
    console.log("Items: ", Items.length);
  } catch (err) {
    console.log(`Error getting gfml functions for ${app.slug} ${err}`);
    failedGFMLFunctions.push({
      slug: app.slug,
      error: (err as Error).message,
    });

    return failedGFMLFunctions;
  }

  for (const func of gfmlFunctions) {
    try {
      console.log("creating gfml function: ", func.slug);
      const now = new Date().toISOString();
      const funcSlug = `${appSlug}:${func.function_slug}`;

      const tableParams = {
        TableName: threePAppGFMLFunctionsTableName,
        Item: {
          ...func,
          id: `${newAccountId}:3p_gfml_functions`,
          slug: funcSlug,
          is_active: true,
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
