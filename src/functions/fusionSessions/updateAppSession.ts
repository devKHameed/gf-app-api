import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { envTableNames } from "../../config";
import { SessionStatus } from "../../enums/fusion";
import { triggerQueueItem } from "../../helpers/fusion";
import { getNextQueueItem } from "../../helpers/fusion/executionQueue";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { FusionSession } from "../../types";
import { updateSession } from "../../util/3pModule";

const dynamodb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        is_paused: {
          type: "boolean",
        },
        is_stopped: {
          type: "boolean",
        },
      },
    },
  },
  required: ["body"],
} as const;

const tableName = envTableNames.DYNAMODB_ACCT_FUSION_SESSION_V2;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  try {
    const accountId = event.headers["account-id"] as string;
    const sessionSlug = event.pathParameters?.slug as string;
    const body = event.body;

    if (!body.is_paused && !body.is_stopped) {
      const { Item } = await dynamodb
        .get({
          TableName: tableName,
          Key: { id: `${accountId}:fusion_sessions`, slug: sessionSlug },
        })
        .promise();

      const session = Item as FusionSession;

      await updateSession(
        accountId,
        sessionSlug,
        `SET session_data.session_status = :status, ${Object.keys(body).reduce(
          (acc, key, idx, arr) => {
            acc += `#${key} = :${key}`;
            if (idx !== arr.length - 1) {
              acc += ", ";
            }
            return acc;
          },
          ""
        )}`,
        {
          ...Object.entries(body).reduce<Record<string, unknown>>(
            (acc, [key, value]) => {
              acc[`:${key}`] = value;
              return acc;
            },
            {}
          ),
          ":status": SessionStatus.Building,
        },
        Object.keys(body).reduce<Record<string, string>>((acc, key) => {
          acc[`#${key}`] = key;
          return acc;
        }, {}),
        { putEvents: false }
      );

      if (session?.is_paused) {
        //Call Operators
        const queueItem = await getNextQueueItem(sessionSlug);
        if (queueItem) {
          await triggerQueueItem(
            queueItem,
            accountId,
            session.session_data,
            session.slug,
            {},
            "resumed"
          );
        }
      }
      return {
        statusCode: 200,
        body: {
          message: "Session Resumed!",
        },
      };
    }

    let status = SessionStatus.Building;
    if (body.is_paused) {
      status = SessionStatus.Paused;
    }

    if (body.is_stopped) {
      status = SessionStatus.UserCancelled;
    }

    await updateSession(
      accountId,
      sessionSlug,
      `SET session_data.session_status = :status, ${Object.keys(body).reduce(
        (acc, key, idx, arr) => {
          acc += `#${key} = :${key}`;
          if (idx !== arr.length - 1) {
            acc += ", ";
          }
          return acc;
        },
        ""
      )}`,
      {
        ...Object.entries(body).reduce<Record<string, unknown>>(
          (acc, [key, value]) => {
            acc[`:${key}`] = value;
            return acc;
          },
          {}
        ),
        ":status": status,
      },
      Object.keys(body).reduce<Record<string, string>>((acc, key) => {
        acc[`#${key}`] = key;
        return acc;
      }, {}),
      { putEvents: false }
    );

    if (body.is_paused) {
      return {
        statusCode: 200,
        body: {
          message: "Session Paused!",
        },
      };
    }
    return {
      statusCode: 200,
      body: {
        message: "Session Stopped!",
      },
    };
  } catch (e) {
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
