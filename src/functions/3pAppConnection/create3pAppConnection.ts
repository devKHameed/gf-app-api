import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { v4 } from "uuid";
import { envTableNames } from "../../config";
import getAccountData from "../../middleware/getAccountData";
import has3pAppAccess from "../../middleware/has3pAppAccess";
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

const tableName = `${envTableNames.DYNAMODB_ACCT_3P_APP_CONNECTIONS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId = event.headers["account-id"];
    const body = event.body;
    const { id } = event.pathParameters || {};
    if (!id) {
      throw {
        message: [{ key: "app_slug", value: "App Slug is required" }],
        code: 421,
      };
    }

    let communication: Record<string, unknown> = {};
    let app_parameters: Record<string, unknown>[] = [];
    let common_data: Record<string, unknown> = {};
    const scope_list: Record<string, unknown> = {};
    const default_scope: Record<string, unknown>[] = [];

    if (body.type === "basic_auth") {
      communication = {
        url: "https://www.example.com/api/whoami",
        headers: {
          authorization:
            "Basic {{base64(parameters.username + ':' + parameters.password)}}",
        },
        log: {
          sanitize: ["request.headers.authorization"],
        },
      };

      app_parameters = [
        {
          name: "username",
          type: "text",
          label: "Username",
          required: true,
        },
        {
          name: "password",
          type: "password",
          label: "Password",
          required: true,
        },
      ];
    } else if (body.type === "oauth1") {
      communication = {
        oauth: {
          consumer_key:
            "{{ifempty(parameters.consumerKey, common.consumerKey)}}",
          consumer_secret:
            "{{ifempty(parameters.consumerSecret, common.consumerSecret)}}",
        },
        requestToken: {
          url: "http://www.example.com/oauth/request_token",
          method: "POST",
          response: {
            temp: {
              token: "{{body.oauth_token}}",
              token_secret: "{{body.oauth_token_secret}}",
            },
            type: "urlencoded",
          },
        },
        authorize: {
          url: "http://www.example.com/oauth/authenticate",
          oauth: {
            token: "{{temp.token}}",
          },
          response: {
            temp: {
              token: "{{query.oauth_token}}",
              verifier: "{{query.oauth_verifier}}",
            },
            type: "urlencoded",
          },
        },
        accessToken: {
          url: "http://www.example.com/oauth/access_token",
          type: "urlencoded",
          oauth: {
            token: "{{temp.token}}",
            verifier: "{{temp.verifier}}",
            token_secret: "{{temp.token_secret}}",
          },
          method: "POST",
          response: {
            data: {
              token: "{{body.oauth_token}}",
              token_secret: "{{body.oauth_token_secret}}",
            },
            type: "urlencoded",
          },
        },
        info: {
          url: "http://www.example.com/api/whoami",
          oauth: {
            token: "{{connection.token}}",
            token_secret: "{{connection.token_secret}}",
          },
          response: {
            uid: "{{body.id}}",
            metadata: {
              type: "text",
              value: "{{body.user}}",
            },
          },
        },
      };

      common_data = {
        consumerKey: "ENTER_CUSTOMER_KEY_HERE",
        consumerSecret: "ENTER_CUSTOMER_SECRET_HERE",
      };

      app_parameters = [
        {
          name: "consumerKey",
          type: "text",
          label: "Consumer Key",
          advanced: true,
        },
        {
          name: "consumerSecret",
          type: "text",
          label: "Consumer Secret",
          advanced: true,
        },
      ];
    } else if (body.type === "api_key") {
      communication = {
        url: "https://www.example.com/api/whoami",
        headers: {
          "x-api-key": "{{parameters.apiKey}}",
        },
        log: {
          sanitize: ["request.headers.x-api-key"],
        },
      };

      app_parameters = [
        {
          name: "apiKey",
          type: "text",
          label: "API Key",
          required: true,
        },
      ];
    } else if (body.type === "digest_auth") {
      communication = {
        url: "https://www.example.com/api/whoami",
        qs: {
          sign: "{{md5(parameters.var1 + parameters.var2 + 'salt')}}",
          var1: "{{parameters.var1}}",
          var2: "{{parameters.var2}}",
        },
      };
    } else if (body.type === "oauth2_client_credentials") {
      communication = {
        token: {
          condition:
            "{{if(data.accessToken, data.expires < addMinutes(now, 1), true)}}",
          url: "https://www.example.com/api/token",
          body: {
            client_id: "{{parameters.clientId}}",
            grant_type: "client_credentials",
            client_secret: "{{parameters.clientSecret}}",
          },
          type: "urlencoded",
          method: "POST",
          response: {
            data: {
              expires: "{{addSeconds(now, body.expires_in)}}",
              accessToken: "{{body.access_token}}",
            },
          },
          log: {
            sanitize: [
              "request.body.client_secret",
              "response.body.access_token",
            ],
          },
        },
        info: {
          url: "https://www.example.com/api/whoami",
          headers: {
            authorization: "Bearer {{connection.accessToken}}",
          },
          response: {
            uid: "{{body.id}}",
            metadata: {
              type: "text",
              value: "{{body.user}}",
            },
          },
          log: {
            sanitize: ["request.headers.authorization"],
          },
        },
        invalidate: {
          url: "https://www.example.com/oauth/invalidate",
          headers: {
            authorization: "Bearer {{connection.accessToken}}",
          },
          log: {
            sanitize: ["request.headers.authorization"],
          },
        },
      };

      app_parameters = [
        {
          name: "clientId",
          type: "text",
          label: "Client ID",
          required: true,
        },
        {
          name: "clientSecret",
          type: "text",
          label: "Client Secret",
          required: true,
        },
      ];
    } else if (body.type === "oauth2_authorization_code_refresh_token") {
      communication = {
        authorize: {
          qs: {
            scope: "{{join(oauth.scope, ',')}}",
            client_id: "{{ifempty(parameters.clientId, common.clientId)}}",
            redirect_uri: "{{oauth.redirectUri}}",
            response_type: "code",
          },
          url: "https://www.example.com/oauth/authorize",
          response: {
            temp: {
              code: "{{query.code}}",
            },
          },
        },
        token: {
          url: "https://www.example.com/api/token",
          method: "POST",
          body: {
            code: "{{temp.code}}",
            client_id: "{{ifempty(parameters.clientId, common.clientId)}}",
            grant_type: "authorization_code",
            redirect_uri: "{{oauth.redirectUri}}",
            client_secret:
              "{{ifempty(parameters.clientSecret, common.clientSecret)}}",
          },
          type: "urlencoded",
          response: {
            data: {
              expires: "{{addSeconds(now, body.expires_in)}}",
              accessToken: "{{body.access_token}}",
              refreshToken: "{{body.refresh_token}}",
            },
            expires: "{{addSeconds(now, body.refresh_expires_in)}}",
          },
          log: {
            sanitize: [
              "request.body.code",
              "request.body.client_secret",
              "response.body.access_token",
              "response.body.refresh_token",
            ],
          },
        },
        refresh: {
          condition: "{{data.expires < addMinutes(now, 15)}}",
          url: "https://www.example.com/api/token",
          method: "POST",
          body: {
            client_id: "{{ifempty(parameters.clientId, common.clientId)}}",
            grant_type: "refresh_token",
            client_secret:
              "{{ifempty(parameters.clientSecret, common.clientSecret)}}",
            refresh_token: "{{data.refreshToken}}",
          },
          type: "urlencoded",
          response: {
            data: {
              expires: "{{addSeconds(now, body.expires_in)}}",
              accessToken: "{{body.access_token}}",
              refreshToken: "{{body.refresh_token}}",
            },
            expires: "{{addSeconds(now, body.refresh_expires_in)}}",
          },
          log: {
            sanitize: [
              "request.body.client_secret",
              "request.body.refresh_token",
              "response.body.access_token",
              "response.body.refresh_token",
            ],
          },
        },
        info: {
          url: "https://www.example.com/api/whoami",
          headers: {
            authorization: "Bearer {{connection.accessToken}}",
          },
          response: {
            uid: "{{body.id}}",
            metadata: {
              type: "text",
              value: "{{body.user}}",
            },
          },
          log: {
            sanitize: ["request.headers.authorization"],
          },
        },
        invalidate: {
          url: "https://www.example.com/oauth/invalidate",
          headers: {
            authorization: "Bearer {{connection.accessToken}}",
          },
          log: {
            sanitize: ["request.headers.authorization"],
          },
        },
      };

      common_data = {
        clientId: "ENTER_CLIENT_ID_HERE",
        clientSecret: "ENTER_CLIENT_SECRET_HERE",
      };

      app_parameters = [
        {
          name: "clientId",
          type: "text",
          label: "Client ID",
          advanced: true,
        },
        {
          name: "clientSecret",
          type: "text",
          label: "Client Secret",
          advanced: true,
        },
      ];
    } else if (body.type === "oauth2_resource_owner_credentials") {
      communication = {
        token: {
          condition:
            "{{if(data.accessToken, data.expires < addMinutes(now, 1), true)}}",
          url: "https://www.example.com/api/token",
          body: {
            password: "{{parameters.password}}",
            username: "{{parameters.username}}",
            client_id: "{{ifempty(parameters.clientId, common.clientId)}}",
            grant_type: "password",
            client_secret:
              "{{ifempty(parameters.clientSecret, common.clientSecret)}}",
          },
          type: "urlencoded",
          method: "POST",
          response: {
            data: {
              expires: "{{addSeconds(now, body.expires_in)}}",
              accessToken: "{{body.access_token}}",
            },
          },
          log: {
            sanitize: [
              "request.body.password",
              "request.body.client_secret",
              "response.body.access_token",
            ],
          },
        },
        info: {
          url: "https://www.example.com/api/whoami",
          headers: {
            authorization: "Bearer {{connection.accessToken}}",
          },
          response: {
            uid: "{{body.id}}",
            metadata: {
              type: "text",
              value: "{{body.user}}",
            },
          },
          log: {
            sanitize: ["request.headers.authorization"],
          },
        },
        invalidate: {
          url: "https://www.example.com/oauth/invalidate",
          headers: {
            authorization: "Bearer {{connection.accessToken}}",
          },
          log: {
            sanitize: ["request.headers.authorization"],
          },
        },
      };

      common_data = {
        clientId: "ENTER_CLIENT_ID_HERE",
        clientSecret: "ENTER_CLIENT_SECRET_HERE",
      };

      app_parameters = [
        {
          name: "username",
          type: "text",
          label: "Username",
          required: true,
        },
        {
          name: "password",
          type: "password",
          label: "Password",
          required: true,
        },
        {
          name: "clientId",
          type: "text",
          label: "Client ID",
          advanced: true,
        },
        {
          name: "clientSecret",
          type: "text",
          label: "Client Secret",
          advanced: true,
        },
      ];
    } else if (body.type === "oauth2_authorization_code") {
      communication = {
        authorize: {
          qs: {
            scope: "{{join(oauth.scope, ',')}}",
            client_id: "{{ifempty(parameters.clientId, common.clientId)}}",
            redirect_uri: "{{oauth.redirectUri}}",
            response_type: "code",
          },
          url: "https://www.example.com/oauth/authorize",
          response: {
            temp: {
              code: "{{query.code}}",
            },
          },
        },
        token: {
          url: "https://www.example.com/api/token",
          body: {
            code: "{{temp.code}}",
            client_id: "{{ifempty(parameters.clientId, common.clientId)}}",
            grant_type: "authorization_code",
            redirect_uri: "{{oauth.redirectUri}}",
            client_secret:
              "{{ifempty(parameters.clientSecret, common.clientSecret)}}",
          },
          type: "urlencoded",
          method: "POST",
          response: {
            data: {
              accessToken: "{{body.access_token}}",
            },
          },
          log: {
            sanitize: [
              "request.body.code",
              "request.body.client_secret",
              "response.body.access_token",
            ],
          },
        },
        info: {
          url: "https://www.example.com/api/whoami",
          headers: {
            authorization: "Bearer {{connection.accessToken}}",
          },
          response: {
            uid: "{{body.id}}",
            metadata: {
              type: "text",
              value: "{{body.user}}",
            },
          },
          log: {
            sanitize: ["request.headers.authorization"],
          },
        },
        invalidate: {
          url: "https://www.example.com/oauth/invalidate",
          headers: {
            authorization: "Bearer {{connection.accessToken}}",
          },
          log: {
            sanitize: ["request.headers.authorization"],
          },
        },
      };

      common_data = {
        clientId: "ENTER_CLIENT_ID_HERE",
        clientSecret: "ENTER_CLIENT_SECRET_HERE",
      };

      app_parameters = [
        {
          name: "clientId",
          type: "text",
          label: "Client ID",
          advanced: true,
        },
        {
          name: "clientSecret",
          type: "text",
          label: "Client Secret",
          advanced: true,
        },
      ];
    }

    const now = new Date().toISOString();

    const tableParams = {
      TableName: tableName,
      Item: {
        id: `3p:${accountId}:3p_app_connections`,
        slug: `${id}:${v4()}`,
        // partner_id: partner.id,
        label: body.label,
        type: body.type,
        communication: communication,
        common_data: common_data,
        scope_list: scope_list,
        default_scope: default_scope,
        app_parameters: app_parameters,
        is_active: body.is_active,
        is_deleted: false,
        created_at: now,
        updated_at: null,
      },
    };
    await dynamodb.put(tableParams).promise();

    return {
      statusCode: 200,
      body: { data: tableParams.Item },
    };
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
};

export const handler = middy()
  .use(getAccountData())
  .use(has3pAppAccess())
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
