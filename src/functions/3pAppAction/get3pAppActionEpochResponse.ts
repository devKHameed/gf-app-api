import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import _ from "lodash";
import { envTableNames } from "../../config";
import { AuthTypes } from "../../constants/3pApp";
import { getFunctions } from "../../helpers/3pExpression";
import { executeModules } from "../../helpers/3pModule";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { ThreePApp, ThreePAppModule } from "../../types";
import {
  checkIfExpired,
  getAppConnection,
  getFusionConnection,
  is3pApp,
  updateAccessToken,
} from "../../util/3pModule";

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

const tableName = `${envTableNames.DYNAMODB_ACCT_3P_ACTIONS}`;
const appsTableName = `${envTableNames.DYNAMODB_ACCT_3P_APPS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  console.log("🚀 ~ file: getEpochResponse.ts ~ line 39 ~ >= ~ event", event);
  try {
    const accountId = event.headers["account-id"] as string;
    const { id: moduleSlug } = event.pathParameters || {};
    const { parameters } = event.body;
    console.log(
      "🚀 ~ file: getEpochResponse.ts ~ line 32 ~ >= ~ moduleSlug",
      moduleSlug
    );
    if (!moduleSlug) {
      throw createHttpError(
        400,
        [{ key: "moduleSlug", value: "module slug is required" }],
        { expose: true }
      );
    }

    const moduleRes = await dynamodb
      .get({
        TableName: tableName,
        Key: {
          id: `3p:${accountId}:3p_app_actions`,
          slug: moduleSlug,
        },
      })
      .promise();
    const appModule = moduleRes.Item as ThreePAppModule | undefined;
    console.log(
      "🚀 ~ file: getEpochResponse.ts ~ line 49 ~ >= ~ appModule",
      appModule
    );

    if (!appModule) {
      throw createHttpError(
        400,
        [{ key: "appModule", value: "3P App Action doesn't exists" }],
        { expose: true }
      );
    }

    if (!appModule?.epoch) {
      throw createHttpError(400, "No Epoch Config Found", { expose: true });
    }

    const appSlug = moduleSlug.split(":").slice(0, -1).join(":");
    console.log(
      "🚀 ~ file: getEpochResponse.ts ~ line 57 ~ >= ~ appSlug",
      appSlug
    );

    const { Item: app } = await dynamodb
      .get({
        TableName: appsTableName,
        Key: {
          id: `${accountId}:3p_apps`,
          slug: appSlug,
        },
      })
      .promise();
    console.log("🚀 ~ file: getEpochResponse.ts ~ line 70 ~ >= ~ app", app);

    if (!app) {
      throw createHttpError(
        400,
        [{ key: "app", value: "3P App doesn't exists" }],
        { expose: true }
      );
    }

    const gfmlFunctions = await getFunctions(appSlug, `${accountId}`);

    const bodyData: Record<string, unknown> = {
      parameters,
    };

    //Get App Connection
    const appConnectionSlug: string =
      appModule.connection_id || appModule.alt_connection_id;
    if (appConnectionSlug) {
      console.log("get app connection: ", appConnectionSlug);
      const appConnection = await getAppConnection(
        appConnectionSlug,
        accountId
      );
      console.log("app_connection: ", appConnection);

      console.log("get connection");
      const connectionItem = await getFusionConnection(
        `${(parameters as any)?.connectionSlug}`,
        accountId
      );
      console.log("connection_item: ", connectionItem);

      const connection = connectionItem?.meta_data as { expires: string };
      bodyData["connection"] = connection;
      bodyData["data"] = connection;

      const updateToken = checkIfExpired(connection);
      console.log("update_token: ", updateToken);

      //get auth type and make sure token is valid
      const oauthType = appConnection?.type;
      if (oauthType === AuthTypes.O2ACRF && updateToken) {
        if (!_.has(appConnection, "communication.refresh")) {
          return;
        }

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
        if (!newConnection) {
          throw createHttpError(
            400,
            new Error("Could not update connection token"),
            { expose: true }
          );
        }
        bodyData["connection"] = newConnection;
      }
    }

    const communication = Array.isArray(appModule.communication)
      ? appModule.communication?.find((com) => !!com.response?.trigger)
      : appModule.communication;

    const mergedCommunication = _.merge(communication, appModule.epoch);

    const [operatorResponses] = await executeModules({
      module: {
        ...appModule,
        communication: mergedCommunication,
      },
      app: app as ThreePApp,
      bodyData,
      appSlug,
      gfmlFunctions,
      accountId: `${accountId}`,
      epoch: true,
      isGlobal: is3pApp(app as ThreePApp),
    });

    return {
      statusCode: 200,
      body: { data: operatorResponses },
    };
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
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
