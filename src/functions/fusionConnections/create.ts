import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import aws4 from "aws4";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import createHttpError from "http-errors";
import https from "https";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { v4 } from "uuid";
import { envTableNames } from "../../config";
import { getFunctions, parseExpression } from "../../helpers/3pExpression";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { get3pApp } from "../../util/3pModule";

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

const tableName = `${envTableNames.DYNAMODB_ACCT_FUSION_CONNECTION}`;
const connectionTableName = `${envTableNames.DYNAMODB_ACCT_3P_APP_CONNECTIONS}`;
const configTableName = `${envTableNames.DYNAMODB_ACCT_3P_CONFIGS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const appId = event.body.app as string;
    console.log("🚀 ~ file: create.ts ~ line 39 ~ >= ~ appId", appId);
    const isGlobal = appId?.startsWith("3p:global:");
    console.log("🚀 ~ file: create.ts ~ line 41 ~ >= ~ isGlobal", isGlobal);
    const accountId = event.headers["account-id"];
    const body = event.body;
    let basic_auth_token = "";
    let x_api_key = "";

    const request_data: Record<string, unknown> = {};
    const header_data: Record<string, string> = {};
    let gf_app_config = {};

    const connection_obj: Record<string, unknown> = {};

    if (body.is_active === undefined) {
      body.is_active = true;
    }

    if (body.is_user === undefined) {
      body.is_user = true;
    }

    console.log({
      TableName: connectionTableName,
      Key: {
        id: `${!isGlobal ? accountId : "3p:global"}:3p_app_connections`, // global
        slug: body.app_connection_id,
      },
    });

    const { Item: connection } = await dynamodb
      .get({
        TableName: connectionTableName,
        Key: {
          id: `${!isGlobal ? accountId : "3p:global"}:3p_app_connections`, // global
          slug: body.app_connection_id,
        },
      })
      .promise();

    console.log("connection: ", connection);
    if (!connection) {
      throw {
        message: [{ key: "app", value: "Connection doesn't exists" }],
        code: 404,
      };
    }

    const { Items: app_config = [] } = await dynamodb
      .query({
        TableName: configTableName,
        FilterExpression: "#is_deleted = :is_deleted",
        KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
        ExpressionAttributeNames: {
          "#is_deleted": "is_deleted",
          "#id": "id",
          "#slug": "slug",
        },
        ExpressionAttributeValues: {
          ":id": `3p_app_config:${event.appId}:${body.app_id}`,
          ":is_deleted": false,
          ":slug": "false:",
        },
      })
      .promise();

    let all_connections = [];

    console.log("app_config", app_config);

    if (app_config.length > 0) {
      console.log("Inside app_config.length > 0");
      if (
        Object.prototype.hasOwnProperty.call(app_config[0], "configurations")
      ) {
        console.log("configurations", app_config[0]);
        if (
          Object.prototype.hasOwnProperty.call(
            app_config[0].configurations,
            "all_connections"
          )
        ) {
          console.log(
            "all_connections",
            app_config[0].configurations.all_connections
          );
          all_connections = app_config[0].configurations.all_connections;
        }
      }
    }

    console.log(all_connections);

    const now = new Date().toISOString();

    const tableParams = {
      TableName: tableName,
      Item: {
        id: `${accountId}:fusion_connections`, // account id
        slug: `${body.app_id}:${body.app_connection_id}:${v4()}`,
        user_id: body.user_id,
        account_id: accountId, // account id
        app_id: body.app_id,
        app_connection_id: body.app_connection_id,
        connection_name: body.connection_name,
        meta_data: {},
        is_active: body.is_active,
        is_deleted: false,
        is_user: body.is_user,
        created_at: now,
        updated_at: now,
      },
    };

    for (const connection_item in all_connections) {
      if (
        all_connections[connection_item].connection_id ==
        `${connection.id}+${connection.slug}`
      ) {
        gf_app_config = all_connections[connection_item].common_object;
      }
    }

    const gfmlFunction = await getFunctions(
      `${body.app_id}`,
      `${!isGlobal ? accountId : "3p:global"}`
    ); // global

    if (connection.type === "basic_auth") {
      // if (connection.communication.url === undefined) {
      //   throw {
      //     message: [{ key: "url", value: "Connection URL doesn't exists" }],
      //     code: 404,
      //   };
      // }
      // if (connection.communication.headers === undefined) {
      //   throw {
      //     message: [
      //       { key: "headers", value: "Connection Headers doesn't exists" },
      //     ],
      //     code: 404,
      //   };
      // }
      // if (connection.communication.headers.authorization === undefined) {
      //   throw {
      //     message: [
      //       {
      //         key: "authorization",
      //         value: "Header Authorization doesn't exists",
      //       },
      //     ],
      //     code: 404,
      //   };
      // }
      try {
        connection.common_data = await parseExpression(connection.common_data, {
          body: { gf_app_config: gf_app_config },
          functions: gfmlFunction,
        });
        const parsedHeaders = await parseExpression<Record<string, string>>(
          connection.communication.headers,
          {
            body: { parameters: body, common: connection.common_data },
            functions: gfmlFunction,
          }
        );

        basic_auth_token = parsedHeaders?.authorization;

        header_data["Authorization"] = basic_auth_token;
        request_data.headers = { ...header_data, ...(parsedHeaders || {}) };
        request_data.method = "GET";
        request_data.url = connection.communication?.url;

        let response: Record<string, unknown> = {};

        try {
          response = await axios.request(request_data);
        } catch (err: any) {
          if (err.response) {
            console.log("errUsman", err);
            return {
              statusCode: err.response.status,
              body: { message: err },
            };
          } else if (err.request) {
            return {
              statusCode: 500,
              body: { message: err },
            };
          } else {
            return {
              statusCode: 500,
              body: { message: err },
            };
          }
        }

        if (response.status != 200) {
          throw {
            message: [{ key: "", value: "Invalid Credentials" }],
            code: 401,
          };
        }

        const threePApp = await get3pApp(
          body.app_id as string,
          `${!isGlobal ? accountId : "3p:global"}` // global
        );

        for (const item in connection.communication.response.data) {
          connection.common_data = await parseExpression(
            connection.common_data,
            {
              body: { gf_app_config: gf_app_config },
              functions: gfmlFunction,
            }
          );
          connection_obj[item] = await parseExpression(
            connection.communication.response.data[item],
            {
              body: {
                parameters: body,
                body: response.data,
                common: connection.common_data,
              },
              functions: gfmlFunction,
              threePApp,
              accountId: !isGlobal ? accountId : "3p:global", // global
            }
          );
        }

        tableParams.Item.meta_data = {
          ...connection_obj,
          auth_header: basic_auth_token,
        };
      } catch (e) {
        throw createHttpError(500, e as Error, { expose: true });
      }
    } else if (connection.type === "api_key") {
      // if (connection.communication.url === undefined) {
      //   throw {
      //     message: [{ key: "url", value: "Connection URL doesn't exists" }],
      //     code: 404,
      //   };
      // }
      if (connection.communication.headers === undefined) {
        throw {
          message: [
            { key: "headers", value: "Connection Headers doesn't exists" },
          ],
          code: 404,
        };
      }
      if (
        connection.communication.headers[
          Object.keys(
            connection.communication.headers as Record<string, unknown>
          )[0]
        ] === undefined
      ) {
        throw {
          message: [
            {
              key: Object.keys(
                connection.communication.headers as Record<string, unknown>
              )[0],
              value: "Header X API Key doesn't exists",
            },
          ],
          code: 404,
        };
      }
      connection.common_data = await parseExpression(connection.common_data, {
        body: { gf_app_config: gf_app_config },
        functions: gfmlFunction,
      });
      x_api_key = await parseExpression(
        connection.communication.headers["x-api-key"],
        {
          body: { parameters: body, common: connection.common_data },
          functions: gfmlFunction,
        }
      );

      const header_data: Record<string, unknown> = {};

      if (connection.communication.headers !== undefined) {
        for (const item in connection.communication.headers) {
          header_data[item] = await parseExpression(
            connection.communication.headers[item],
            {
              body: {
                parameters: body,
                common: connection.common_data,
              },
              functions: gfmlFunction,
            }
          );
        }
      }

      request_data.headers = header_data;
      request_data.method = "GET";
      request_data.url = await parseExpression<string>(
        connection.communication.url,
        {
          body: {
            parameters: body,
            common: connection.common_data,
          },
          functions: gfmlFunction,
        }
      );

      let response: Record<string, unknown> = {};

      try {
        if (request_data.url) {
          response = await axios.request(request_data);
          if (response.status != 200) {
            throw {
              message: [{ key: "", value: "Invalid Credentials" }],
              code: 401,
            };
          }
        }
      } catch (err: any) {
        if (err.response) {
          return {
            statusCode: err.response.status,
            body: { message: err },
          };
        } else if (err.request) {
          return {
            statusCode: 500,
            body: { message: err },
          };
        } else {
          return {
            statusCode: 500,
            body: { message: err },
          };
        }
      }

      (tableParams.Item.meta_data as Record<string, unknown>).x_api_key =
        x_api_key;
      (tableParams.Item.meta_data as Record<string, unknown>).header_data =
        header_data;
    } else if (connection.type === "oauth2_authorization_code_refresh_token") {
      console.log("body", body);
      if (body.type === "authorize") {
        let query_string = "";

        if (connection.communication.authorize.url === undefined) {
          throw {
            message: [{ key: "url", value: "Connection URL doesn't exists" }],
            code: 404,
          };
        }
        if (connection.communication.authorize.qs === undefined) {
          throw {
            message: [{ key: "qs", value: "Query String doesn't exists" }],
            code: 404,
          };
        }

        for (const item in connection.communication.authorize.qs) {
          connection.common_data = await parseExpression(
            connection.common_data,
            {
              body: { gf_app_config: gf_app_config },
              functions: gfmlFunction,
            }
          );
          query_string =
            query_string +
            `${item}=${await parseExpression(
              connection.communication.authorize.qs[item],
              {
                body: { parameters: body, common: connection.common_data },
                functions: gfmlFunction,
              }
            )}&`;
        }

        query_string = `${connection.communication.authorize.url}?${query_string}`;
        query_string = query_string.substring(0, query_string.length - 1);

        return {
          statusCode: 201,
          body: {
            data: { query_string: query_string },
          },
        };
      } else if (body.type === "token") {
        let body_data: Record<string, unknown> | string = {};
        const header_data: Record<string, unknown> = {};
        const token_header_data: Record<string, unknown> = {};
        let access_token_result = {};
        const info_data: Record<string, unknown> = {};
        console.log(connection_obj);
        console.log(header_data);
        console.log(access_token_result);
        console.log(info_data);

        if (!body.code) {
          throw createHttpError(500, new Error("Code is required"), {
            expose: true,
          });
        }

        if (connection.communication.token === undefined) {
          throw {
            message: [{ key: "token", value: "Token Object doesn't exists" }],
            code: 404,
          };
        }

        if (connection.communication.token.url === undefined) {
          throw {
            message: [{ key: "url", value: "Connection URL doesn't exists" }],
            code: 404,
          };
        }

        if (connection.communication.token.method === undefined) {
          throw {
            message: [
              { key: "method", value: "Connection Method doesn't exists" },
            ],
            code: 404,
          };
        }

        if (connection.communication.token.body === undefined) {
          throw {
            message: [{ key: "body", value: "Connection Body doesn't exists" }],
            code: 404,
          };
        }

        request_data.method = connection.communication.token.method;
        request_data.url = connection.communication.token.url;

        for (const item in connection.communication.token.body) {
          connection.common_data = await parseExpression(
            connection.common_data,
            {
              body: { gf_app_config: gf_app_config },
              functions: gfmlFunction,
            }
          );
          body_data[item] = await parseExpression(
            connection.communication.token.body[item],
            {
              body: { parameters: body, common: connection.common_data },
              functions: gfmlFunction,
            }
          );
        }

        if (connection.communication.token.type) {
          // Check if application/x-www-form-urlencoded than alter data according to that
          if (connection.communication.token.type === "urlencoded") {
            token_header_data["Content-Type"] =
              "application/x-www-form-urlencoded";
            const form_body = [];

            for (const property in body_data) {
              form_body.push(`${property}=${body_data[property]}`);
            }
            body_data = form_body.join("&");
          }
        }

        if (connection.communication.token.headers !== undefined) {
          for (const item in connection.communication.token.headers) {
            token_header_data[item] = await parseExpression(
              connection.communication.token.headers[item],
              {
                body: {
                  parameters: body,
                  common: connection.common_data,
                },
                functions: gfmlFunction,
              }
            );
          }
        }

        request_data.data = body_data;
        request_data.headers = token_header_data;

        console.log("requestData", request_data);

        let response: Record<string, unknown> = {};

        try {
          response = await axios.request(request_data);
        } catch (err: any) {
          if (err.response) {
            console.log("errUsman", err);
            return {
              statusCode: err.response.status,
              body: { message: err },
            };
          } else if (err.request) {
            return {
              statusCode: 500,
              body: { message: err },
            };
          } else {
            return {
              statusCode: 500,
              body: { message: err },
            };
          }
        }

        console.log("requestResponse", response);

        if (response.status != 200) {
          throw {
            message: [{ key: "", value: "Invalid Credentials" }],
            code: 401,
          };
        }

        if (response.data) {
          access_token_result = response.data;
          const threePApp = await get3pApp(
            body.app_id as string,
            `${!isGlobal ? accountId : "3p:global"}` // global
          );
          console.log(threePApp);

          for (const item in connection.communication.token.response.data) {
            connection.common_data = await parseExpression(
              connection.common_data,
              {
                body: { gf_app_config: gf_app_config },
                functions: gfmlFunction,
              }
            );
            connection_obj[item] = await parseExpression(
              connection.communication.token.response.data[item],
              {
                body: {
                  parameters: body,
                  body: access_token_result,
                  common: connection.common_data,
                },
                functions: gfmlFunction,
                threePApp,
                accountId: !isGlobal ? accountId : "3p:global", // global
              }
            );
          }

          if (connection.communication.info === undefined) {
            throw {
              message: [{ key: "info", value: "Info Object doesn't exists" }],
              code: 404,
            };
          }

          if (connection.communication.info.headers === undefined) {
            throw {
              message: [
                { key: "headers", value: "Info Headers doesn't exists" },
              ],
              code: 404,
            };
          }

          if (connection.communication.info.url === undefined) {
            throw {
              message: [{ key: "url", value: "Info URL doesn't exists" }],
              code: 404,
            };
          }

          info_data.method = "get";
          info_data.url = connection.communication.info.url;

          console.log("HEADERS: ", connection.communication.info.headers);
          for (const item in connection.communication.info.headers) {
            if (item === "Authorization") {
              header_data[item] = `Bearer ${await parseExpression(
                connection.communication.info.headers[item],
                {
                  body: { connection: connection_obj },
                  functions: gfmlFunction,
                }
              )}`;
            } else {
              header_data[item] = await parseExpression(
                connection.communication.info.headers[item],
                {
                  body: { connection: connection_obj },
                  functions: gfmlFunction,
                }
              );
            }
          }

          info_data.headers = header_data;
          console.log(
            "🚀 ~ file: create.ts ~ line 493 ~ >= ~ info_data",
            info_data
          );

          let axios_info_result_response: Record<string, unknown> = {};

          try {
            axios_info_result_response = await axios.request(info_data);
          } catch (err: any) {
            if (err.response) {
              return {
                statusCode: err.response.status,
                body: { message: err },
              };
            } else if (err.request) {
              return {
                statusCode: 500,
                body: { message: err },
              };
            } else {
              return {
                statusCode: 500,
                body: { message: err },
              };
            }
          }

          console.log(
            "🚀 ~ file: create.ts ~ line 499 ~ >= ~ axios_info_result_response",
            axios_info_result_response
          );

          if (axios_info_result_response.status != 200) {
            throw {
              message: [{ key: "", value: "Invalid Credentials" }],
              code: 401,
            };
          }

          connection_obj.info = {};

          (connection_obj as Record<string, any>).info = await parseExpression(
            connection.communication.info.response,
            {
              body: {
                parameters: {},
                body: axios_info_result_response.data,
                common: connection.common_data,
              },
              functions: gfmlFunction,
              threePApp,
              accountId: !isGlobal ? accountId : "3p:global", // global
            }
          );
        }

        tableParams.Item.meta_data = connection_obj;
      }
    } else if (connection.type === "oauth2_authorization_code") {
      if (body.type === "authorize") {
        let query_string = "";

        if (connection.communication.authorize.url === undefined) {
          throw {
            message: [{ key: "url", value: "Connection URL doesn't exists" }],
            code: 404,
          };
        }
        if (connection.communication.authorize.qs === undefined) {
          throw {
            message: [{ key: "qs", value: "Query String doesn't exists" }],
            code: 404,
          };
        }

        for (const item in connection.communication.authorize.qs) {
          connection.common_data = await parseExpression(
            connection.common_data,
            {
              body: { gf_app_config: gf_app_config },
              functions: gfmlFunction,
            }
          );
          query_string =
            query_string +
            `${item}=${await parseExpression(
              connection.communication.authorize.qs[item],
              {
                body: { parameters: body, common: connection.common_data },
                functions: gfmlFunction,
              }
            )}&`;
        }

        query_string = `${connection.communication.authorize.url}?${query_string}`;
        query_string = query_string.substring(0, query_string.length - 1);

        return {
          statusCode: 201,
          body: {
            data: { query_string: query_string },
          },
        };
      } else if (body.type === "token") {
        let body_data: Record<string, unknown> | string = {};
        const header_data: Record<string, unknown> = {};
        const token_header_data: Record<string, unknown> = {};
        let access_token_result = {};
        const info_data: Record<string, unknown> = {};
        console.log(connection_obj);
        console.log(header_data);
        console.log(access_token_result);
        console.log(info_data);

        if (!body.code) {
          throw createHttpError(500, new Error("Code is required"), {
            expose: true,
          });
        }

        if (connection.communication.token === undefined) {
          throw {
            message: [{ key: "token", value: "Token Object doesn't exists" }],
            code: 404,
          };
        }

        if (connection.communication.token.url === undefined) {
          throw {
            message: [{ key: "url", value: "Connection URL doesn't exists" }],
            code: 404,
          };
        }

        if (connection.communication.token.method === undefined) {
          throw {
            message: [
              { key: "method", value: "Connection Method doesn't exists" },
            ],
            code: 404,
          };
        }

        if (connection.communication.token.body === undefined) {
          throw {
            message: [{ key: "body", value: "Connection Body doesn't exists" }],
            code: 404,
          };
        }

        request_data.method = connection.communication.token.method;
        request_data.url = connection.communication.token.url;

        for (const item in connection.communication.token.body) {
          connection.common_data = await parseExpression(
            connection.common_data,
            {
              body: { gf_app_config: gf_app_config },
              functions: gfmlFunction,
            }
          );
          body_data[item] = await parseExpression(
            connection.communication.token.body[item],
            {
              body: { parameters: body, common: connection.common_data },
              functions: gfmlFunction,
            }
          );
        }

        // check if the contenet type is defined in token object and alter code according to that
        if (connection.communication.token.type) {
          // Check if application/x-www-form-urlencoded than alter data according to that
          if (connection.communication.token.type === "urlencoded") {
            token_header_data["Content-Type"] =
              "application/x-www-form-urlencoded";
            const form_body = [];

            for (const property in body_data) {
              form_body.push(`${property}=${body_data[property]}`);
            }
            body_data = form_body.join("&");
          }
        }

        if (connection.communication.token.headers !== undefined) {
          for (const item in connection.communication.token.headers) {
            token_header_data[item] = await parseExpression(
              connection.communication.token.headers[item],
              {
                body: {
                  parameters: body,
                  common: connection.common_data,
                },
                functions: gfmlFunction,
              }
            );
          }
        }

        request_data.data = body_data;
        request_data.headers = token_header_data;

        console.log("requestData", request_data);

        let response: Record<string, unknown> = {};

        try {
          response = await axios.request(request_data);
        } catch (err: any) {
          if (err.response) {
            console.log("errUsman", err);
            return {
              statusCode: err.response.status,
              body: { message: err },
            };
          } else if (err.request) {
            return {
              statusCode: 500,
              body: { message: err },
            };
          } else {
            return {
              statusCode: 500,
              body: { message: err },
            };
          }
        }

        console.log("requestResponse", response);

        if (response.status != 200) {
          throw {
            message: [{ key: "", value: "Invalid Credentials" }],
            code: 401,
          };
        }

        if (response.data) {
          access_token_result = response.data;
          const threePApp = await get3pApp(
            body.app_id as string,
            `${!isGlobal ? accountId : "3p:global"}` // global
          );
          console.log(threePApp);
          console.log("Token Data", access_token_result);
          console.log({
            connection_obj: JSON.stringify(connection_obj, null, 2),
            responseData: connection.communication.token.response.data,
          });
          for (const item in connection.communication.token.response.data) {
            connection.common_data = await parseExpression(
              connection.common_data,
              {
                body: { gf_app_config: gf_app_config },
                functions: gfmlFunction,
              }
            );
            connection_obj[item] = await parseExpression(
              connection.communication.token.response.data[item],
              {
                body: {
                  parameters: body,
                  body: access_token_result,
                  common: connection.common_data,
                },
                functions: gfmlFunction,
                threePApp,
                accountId: !isGlobal ? accountId : "3p:global", // global
              }
            );
          }
          console.log({
            connection_obj: JSON.stringify(connection_obj, null, 2),
          });

          if (connection.communication.info === undefined) {
            throw {
              message: [{ key: "info", value: "Info Object doesn't exists" }],
              code: 404,
            };
          }

          if (connection.communication.info.headers === undefined) {
            throw {
              message: [
                { key: "headers", value: "Info Headers doesn't exists" },
              ],
              code: 404,
            };
          }

          if (connection.communication.info.url === undefined) {
            throw {
              message: [{ key: "url", value: "Info URL doesn't exists" }],
              code: 404,
            };
          }

          info_data.method = "get";
          info_data.url = connection.communication.info.url;

          for (const item in connection.communication.info.headers) {
            if (item === "Authorization") {
              header_data[item] = `Bearer ${await parseExpression(
                connection.communication.info.headers[item],
                {
                  body: { connection: connection_obj },
                  functions: gfmlFunction,
                }
              )}`;
            } else {
              header_data[item] = await parseExpression(
                connection.communication.info.headers[item],
                {
                  body: { connection: connection_obj },
                  functions: gfmlFunction,
                }
              );
            }
          }

          info_data.headers = header_data;

          let axios_info_result_response: Record<string, unknown> = {};

          try {
            axios_info_result_response = await axios.request(info_data);
          } catch (err: any) {
            if (err.response) {
              return {
                statusCode: err.response.status,
                body: { message: err },
              };
            } else if (err.request) {
              return {
                statusCode: 500,
                body: { message: err },
              };
            } else {
              return {
                statusCode: 500,
                body: { message: err },
              };
            }
          }

          if (axios_info_result_response.status != 200) {
            throw {
              message: [{ key: "", value: "Invalid Credentials" }],
              code: 401,
            };
          }

          connection_obj.info = {};
          console.log(
            "Connection Obj",
            JSON.stringify(connection_obj, null, 2)
          );
          (connection_obj as Record<string, any>).info = await parseExpression(
            connection.communication.info.response,
            {
              body: {
                parameters: {},
                body: axios_info_result_response.data,
                common: connection.common_data,
              },
              functions: gfmlFunction,
              threePApp,
              accountId: !isGlobal ? accountId : "3p:global", // global
            }
          );
        }
        console.log("Connection Obj", JSON.stringify(connection_obj, null, 2));

        tableParams.Item.meta_data = connection_obj;
        console.log(
          "🚀 ~ file: create.ts:947 ~ >= ~ tableParams:",
          JSON.stringify(tableParams, null, 2)
        );
      }
    } else if (connection.type === "oauth1") {
      const data = await parseExpression("{{body.oauth_token_secret}}", {
        body: { body: { oauth_token_secret: "123" } },
        functions: gfmlFunction,
      });
      return {
        statusCode: 201,
        body: { data },
      };
    } else if (connection.type === "other") {
      if (Object.prototype.hasOwnProperty.call(connection, "communication")) {
        if (
          Object.prototype.hasOwnProperty.call(connection.communication, "aws")
        ) {
          if (connection.communication.aws.sign_version === 4) {
            let result = {};
            request_data.host = (connection.communication.url as string)
              .replace("https://", "")
              .replace("http://", "");
            request_data.body = new URLSearchParams(
              connection.communication.body as Record<string, string>
            ).toString();
            request_data.method = connection.communication.method;

            connection.common_data = await parseExpression(
              connection.common_data,
              {
                body: { gf_app_config: gf_app_config },
                functions: gfmlFunction,
              }
            );
            const key = await parseExpression(
              connection.communication.aws.key,
              {
                body: { parameters: body, common: connection.common_data },
                functions: gfmlFunction,
              }
            );
            const secret = await parseExpression(
              connection.communication.aws.secret,
              {
                body: { parameters: body, common: connection.common_data },
                functions: gfmlFunction,
              }
            );
            const xml_parser = new XMLParser();

            return await new Promise((res, rej) => {
              https
                .request(
                  aws4.sign(request_data, {
                    accessKeyId: key as string,
                    secretAccessKey: secret as string,
                  }),
                  (response) => {
                    if (response.statusCode === 200) {
                      response.on("data", (chunk: string) => {
                        result = xml_parser.parse(chunk);
                        connection_obj.result = result;
                        connection_obj.key = key;
                        connection_obj.secret = secret;
                        tableParams.Item.meta_data = connection_obj;
                        dynamodb
                          .put(tableParams)
                          .promise()
                          .then(() => {
                            res({
                              statusCode: 201,
                              body: {
                                message:
                                  "Fusion Connection created successfully",
                                data: tableParams.Item,
                              },
                            });
                          })
                          .catch(() => {
                            rej(new Error("DB Error"));
                          });
                      });
                    } else {
                      rej(new Error("Error"));
                    }
                  }
                )
                .end(request_data.body || "");
            }).catch((e) => {
              throw createHttpError(500, e as Error, { expose: true });
            });
          }
        }
      } else {
        throw createHttpError(
          404,
          new Error("communication doesn't exists in connection"),
          { expose: true }
        );
      }
    }

    if (connection.type !== "other") {
      console.log(
        "🚀 ~ file: create.ts ~ line 841 ~ >= ~ tableParams",
        tableParams
      );
      await dynamodb.put(tableParams).promise();
      return {
        statusCode: 201,
        body: {
          message: "Fusion Connection created successfully",
          data: tableParams.Item,
        },
      };
    }
  } catch (e) {
    console.log(e);
    throw createHttpError(500, e as Error, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  // .use(validator({ eventSchema })) // validates the input
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
