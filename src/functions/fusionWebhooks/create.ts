import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import _, { isEmpty } from "lodash";
import { v4 } from "uuid";
import { envTableNames } from "../../config";
import { AuthTypes } from "../../constants/3pApp";
import { getFunctions, parseExpression } from "../../helpers/3pExpression";
import { executeModules } from "../../helpers/3pModule";
import { ValidatedEventAPIGatewayProxyEvent } from "../../lib/apiGateway";
import duplicateSlugCheck from "../../middleware/duplicateSlugCheck";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { ThreePApp } from "../../types";
import {
  checkIfExpired,
  getAppConnection,
  getFusionConnection,
  updateAccessToken,
} from "../../util/3pModule";
import getGuiFusionHttpApiUrl from "../../util/ssm/getGuiFusionHttpApiUrl";

const dynamodb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
    },
  },
  required: ["body"],
} as const;

const tableName = `${envTableNames.DYNAMODB_ACCT_FUSION_WEBHOOK}`;
const actionsTableName = `${envTableNames.DYNAMODB_ACCT_3P_ACTIONS}`;
const webhooksTableName = `${envTableNames.DYNAMODB_ACCT_3P_APP_WEBHOOKS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const GUI_FUSION_API_URL = await getGuiFusionHttpApiUrl();
    const accountId = event.headers["account-id"] as string;
    const body = event.body;
    const now = new Date().toISOString();

    let tableParams: DynamoDB.DocumentClient.PutItemInput = {
      TableName: tableName,
      Item: {},
    };

    // let webhookConnectionSlug = `${body.module_slug}:${
    //   body.fusion_connection_slug
    // }:${v4()}`;
    let webhookConnectionSlug = `${body.module_slug}:${v4()}`;

    if (body.module_slug !== "system") {
      let isGlobal = false;
      let { Item } = await dynamodb
        .get({
          TableName: actionsTableName,
          Key: {
            id: `${accountId}:3p_app_actions`,
            slug: body.module_slug,
          },
        })
        .promise();
      console.log("🚀 ~ file: create.ts:61 ~ >= ~ Item", Item);
      if (!Item) {
        Item = await dynamodb
          .get({
            TableName: actionsTableName,
            Key: {
              id: "3p:global:3p_app_actions",
              slug: body.module_slug,
            },
          })
          .promise()
          .then((res) => res.Item);
        console.log("🚀 ~ file: create.ts:72 ~ >= ~ Item", Item);
        if (!Item) {
          throw {
            message: `Module doesn't exists against this id=${body.module_slug}`,
            code: 404,
          };
        }
        isGlobal = true;
      }

      const { Item: webhook } = await dynamodb
        .get({
          TableName: webhooksTableName,
          Key: {
            id: `${isGlobal ? "3p:global" : accountId}:3p_app_webhooks`,
            slug: Item.connection_id,
          },
        })
        .promise();
      if (!webhook) {
        throw {
          message: `Webhook doesn't exists against this id=${body.module_slug}`,
          code: 404,
        };
      }

      let uuid = "";
      let webhook_url = "";

      if (webhook.webhook_type === "shared") {
        uuid = webhook.shared_url_uuid;
        webhook_url = webhook.shared_url_address;
      } else {
        uuid = v4().replace(/-/g, "");
        webhook_url = `${GUI_FUSION_API_URL}/fusion/webhook/dedicated/${accountId}?id=${webhookConnectionSlug}`;
      }

      tableParams = {
        TableName: tableName,
        Item: {
          id: `${accountId}:fusion_webhooks`,
          slug: webhookConnectionSlug,
          webhook_name: body.webhook_name,
          module_slug: body.module_slug,
          fusion_slug: body.fusion_slug,
          fusion_connection_slug: body.fusion_connection_slug,
          user_id: body.user_id,
          account_id: accountId,
          connection_id: webhook.connection_id,
          webhook_url: webhook_url,
          webhook_type: webhook.webhook_type,
          webhook_slug: webhook.slug,
          parameters: body.parameters || {},
          ip_restrictions: body.ip_restrictions,
          data_structure: body.data_structure,
          get_request_headers: body.get_request_headers,
          get_request_http_method: body.get_request_http_method,
          json_passthrough: body.json_passthrough,
          data_structures: body.data_structures,
          url_uuid: uuid,
          is_active: body.is_active,
          is_deleted: false,
          created_at: now,
          updated_at: now,
        },
      };

      const moduleSlug = (body.module_slug as string)?.split(":");
      moduleSlug.pop();
      const appSlug = moduleSlug.join(":");
      const app = await dynamodb
        .get({
          TableName: envTableNames.DYNAMODB_ACCT_3P_APPS,
          Key: {
            id: `${isGlobal ? "3p:global" : accountId}:3p_apps`,
            slug: appSlug,
          },
        })
        .promise()
        .then((res) => res.Item as ThreePApp);

      const attachWebhookConfig = webhook.app_attach;

      const appConnection = await getAppConnection(
        (webhook.connection_id || webhook.alt_connection_id || "") as string,
        isGlobal ? "3p:global" : accountId
      );
      console.log(
        "🚀 ~ file: create.ts:160 ~ >= ~ appConnection",
        appConnection
      );

      console.log("get connection", {
        slug: body.fusion_connection_slug as string,
        accountId: accountId,
      });
      const connectionItem = await getFusionConnection(
        (body.fusion_connection_slug || "") as string,
        accountId
      );
      console.log("connection_item: ", connectionItem);

      const bodyData: Record<string, unknown> = {};
      const gfmlFunctions = await getFunctions("", accountId);

      bodyData["common"] = await parseExpression(appConnection?.common_data, {
        body: bodyData,
        responses: {},
        functions: gfmlFunctions,
      });

      const connection = connectionItem?.meta_data as { expires: string };
      bodyData["connection"] = connection;
      bodyData["data"] = connection;

      const updateToken = connection ? checkIfExpired(connection) : false;
      console.log("update_token: ", updateToken);

      //get auth type and make sure token is valid
      const oauthType = appConnection?.type;
      if (oauthType === AuthTypes.O2ACRF && updateToken && connectionItem) {
        if (_.has(appConnection, "communication.refresh")) {
          const refreshData: Record<string, unknown> =
            appConnection?.communication.refresh;

          const newConnection = await updateAccessToken(
            refreshData,
            bodyData,
            appSlug,
            connectionItem,
            gfmlFunctions
          );
          console.log("new_connection: ", newConnection);
          bodyData["connection"] = newConnection;
        }
      }

      tableParams.Item.webhook = {
        url: webhook_url,
      };

      if (!isEmpty(attachWebhookConfig)) {
        const responses = await executeModules({
          module: { communication: attachWebhookConfig },
          app,
          gfmlFunctions,
          accountId,
          appSlug: "",
          bodyData: {
            parameters: body.parameters || {},
            webhook: {
              url: webhook_url,
            },
            connection: connectionItem?.meta_data,
            ...bodyData,
          },
        });
        console.log("🚀 ~ file: create.ts:168 ~ >= ~ responses", responses);

        const lastResponse = _.last(responses) as { externalHookId: string };
        tableParams.Item.webhook = {
          ...tableParams.Item.webhook,
          ...(lastResponse || {}),
        };
      }
    } else {
      webhookConnectionSlug = `${body.module_slug}:${v4()}`;
      const uuid = v4().replace(/-/g, "");
      const webhook_url = `${GUI_FUSION_API_URL}/fusion/webhook/dedicated/${accountId}?id=${webhookConnectionSlug}`;

      tableParams = {
        TableName: tableName,
        Item: {
          id: `${accountId}:fusion_webhooks`,
          slug: webhookConnectionSlug,
          webhook_name: body.webhook_name,
          module_slug: body.module_slug,
          fusion_slug: body.fusion_slug,
          fusion_connection_slug: body.fusion_connection_slug,
          user_id: body.user_id,
          account_id: accountId,
          connection_id: "",
          webhook_url: webhook_url,
          webhook_type: "dedicated",
          ip_restrictions: body.ip_restrictions,
          data_structure: body.data_structure,
          get_request_headers: body.get_request_headers,
          get_request_http_method: body.get_request_http_method,
          json_passthrough: body.json_passthrough,
          data_structures: body.data_structures,
          url_uuid: uuid,
          is_active: body.is_active,
          is_deleted: false,
          created_at: now,
          updated_at: now,
        },
      };
    }
    await dynamodb.put(tableParams).promise();

    return {
      statusCode: 200,
      body: {
        data: tableParams.Item,
      },
    };
  } catch (e) {
    console.log(e);
    throw createHttpError(500, e as Error, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  // .use(validator({ eventSchema })) // validates the input
  .use(
    duplicateSlugCheck({
      slugKey: "module_slug",
      tableName: `${envTableNames.DYNAMODB_ACCT_FUSION_WEBHOOK}`,
      accountPostfix: "fusion_webhooks",
    })
  )
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
