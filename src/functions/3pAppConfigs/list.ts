import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { ThreePApp, ThreePAppConnection } from "types/Fusion/3pApp";
import { envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

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

const tableName = `${envTableNames.DYNAMODB_ACCT_3P_CONFIGS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId = event.headers["account-id"];
    const { appId, three_p_app_id } = event.pathParameters || {};
    let is_active = false;

    // Check Owner
    const { Item: app } = await dynamodb
      .get({
        TableName: tableName,
        Key: {
          id: appId,
          // partnerId: partner.id,
        },
      })
      .promise();

    if (!app) {
      throw {
        message: [{ key: "app", value: "App doesn't exists" }],
        code: 404,
      };
    }

    // const partner_id = partner.id;

    const all_connections = [];
    let temp_variable_list: Record<string, unknown> = {};

    const three_p_app_config = await dynamodb
      .query({
        TableName: tableName,
        KeyConditionExpression: "#id = :id",
        FilterExpression: "#is_deleted = :is_deleted",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
          "#id": "id",
        },
        ExpressionAttributeValues: {
          ":id": `3p_app_config:${appId}:${three_p_app_id}`,
          ":is_deleted": false,
        },
      })
      .promise();

    const { Item: three_p_app } = await dynamodb
      .get({
        TableName: tableName,
        Key: {
          id: `${accountId}:3p_apps`,
          slug: three_p_app_id,
        },
      })
      .promise();

    if (!three_p_app) {
      throw {
        message: `3P App doesn't exists against this id=${three_p_app_id}`,
        code: 404,
      };
    }

    const base_common_query = getVars((three_p_app as ThreePApp).common_data);
    let all_connections_query = [];

    const { Items: self_connections = [] } = await dynamodb
      .query({
        TableName: tableName,
        KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
        FilterExpression: "#is_deleted = :is_deleted", // AND #partner_id = :partner_id",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
          "#id": "id",
          "#slug": "slug",
          // "#partner_id": "partner_id",
        },
        ExpressionAttributeValues: {
          ":id": `${accountId}:3p_app_connections`,
          ":is_deleted": false,
          ":slug": `${three_p_app.app_name}:`,
          // ":partner_id": partner.id,
        },
      })
      .promise();

    const { Items: master_connections = [] } = await dynamodb
      .query({
        TableName: tableName,
        KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
        FilterExpression: "#is_deleted = :is_deleted", // AND #partner_id = :partner_id",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
          "#id": "id",
          "#slug": "slug",
          // "#partner_id": "partner_id",
        },
        ExpressionAttributeValues: {
          ":id": `${accountId}:3p_app_connections`,
          ":is_deleted": false,
          ":slug": `${three_p_app.app_name}:`,
          // ":partner_id": "7961418f-e845-4be0-9ac5-7036a91eebb9",
        },
      })
      .promise();

    all_connections_query = [...self_connections, ...master_connections];

    for (const connection of all_connections_query) {
      const connections_obj: Record<string, unknown> = {};
      connections_obj.connection_id = `${connection.id}+${connection.slug}`;
      connections_obj.connection_title = connection.label;
      connections_obj.common_object = getVars(
        (connection as ThreePAppConnection).common_data
      );
      all_connections.push(connections_obj);
    }

    if (three_p_app_config.Count && three_p_app_config.Count > 0) {
      temp_variable_list = three_p_app_config.Items?.[0].configurations;

      is_active = three_p_app_config.Items?.[0].is_active;

      if (
        Object.prototype.hasOwnProperty.call(
          temp_variable_list,
          "base_common_object"
        )
      ) {
        for (const item in base_common_query) {
          if (
            Object.prototype.hasOwnProperty.call(
              temp_variable_list.base_common_object,
              item
            )
          ) {
            base_common_query[item] = (
              temp_variable_list.base_common_object as Record<string, unknown>
            )[item];
          }
        }
      }

      if (
        Object.prototype.hasOwnProperty.call(
          temp_variable_list,
          "all_connections"
        )
      ) {
        const config_all_connections =
          temp_variable_list.all_connections as Record<string, unknown>[];

        all_connections.forEach(function (connection) {
          for (const item in connection) {
            if (item === "connection_id") {
              config_all_connections.forEach(function (config_connection) {
                for (const config_item in config_connection) {
                  if (config_item === "connection_id") {
                    if (connection[item] === config_connection[config_item]) {
                      console.log(connection[item]);
                      console.log(config_connection[config_item]);
                      for (const inner_item in connection[
                        "common_object"
                      ] as Record<string, unknown>) {
                        if (
                          Object.prototype.hasOwnProperty.call(
                            config_connection["common_object"],
                            inner_item
                          )
                        ) {
                          (
                            connection["common_object"] as Record<
                              string,
                              unknown
                            >
                          )[inner_item] = (
                            config_connection["common_object"] as Record<
                              string,
                              unknown
                            >
                          )[inner_item];
                        }
                      }
                    }
                  }
                }
              });
            }
          }
        });
      }
    }

    return {
      statusCode: 200,
      body: {
        configurations: {
          base_common_object: base_common_query,
          all_connections: all_connections,
        },
        is_active: is_active,
        temp_variable_list: temp_variable_list,
        three_p_app_config: three_p_app_config,
      },
    };
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
};

const getVars = (items: ThreePAppConnection["common_data"]) => {
  return Object.keys(items).reduce<Record<string, unknown>>((acc, item) => {
    const pattern = /\{{(.*?)\}}/g;
    const matches = [];
    let match;

    while ((match = pattern.exec(item)) != null) {
      matches.push(match[1]);
    }

    for (let counter = 0; counter < matches.length; counter++) {
      acc[matches[counter].replace("gf_app_config.", "")] = "";
    }

    return acc;
  }, {});
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
