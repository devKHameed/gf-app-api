import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import {
  ACCOUNT_GF_DASHBOARD_WIDGET_TABLE_NAME,
  envTableNames,
} from "../../config";
import { dynamodb } from "../../helpers/db";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { AccountUser } from "../../types";
import { GuiDashboardWidget } from "../../types/GuiDashboardWidget";
import { createUniversalEvent } from "../universalEvent/createUniversalEvent";

const TABLE_NAME = envTableNames.DYNAMODB_GF_DASHBOARD_WIDGETS;

const eventSchema = {
  type: "object",
  properties: {},
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const slug = event.pathParameters!.slug;
  const accountId = event.headers["account-id"] as string;

  const user = event.user as AccountUser;

  if (!user) {
    throw createError(401, "Unauthorized");
  }

  const paramsGet: DynamoDB.DocumentClient.GetItemInput = {
    TableName: TABLE_NAME,
    Key: {
      id: `${accountId}:${ACCOUNT_GF_DASHBOARD_WIDGET_TABLE_NAME}`,
      slug: slug,
    },
  };

  const { Item } = await dynamodb.get(paramsGet);
  const widget = Item as GuiDashboardWidget;

  const [_, ...slugChunks] = widget.slug.split(":");

  const isDeleted = 1;
  widget.slug = `${isDeleted}:${slugChunks.join(":")}`;
  widget.is_deleted = isDeleted;

  const params: DynamoDB.DocumentClient.PutItemInput = {
    TableName: TABLE_NAME,
    Item: widget,
  };

  try {
    await dynamodb.delete({
      TableName: TABLE_NAME,
      Key: {
        id: `${accountId}:${ACCOUNT_GF_DASHBOARD_WIDGET_TABLE_NAME}`,
        slug: slug,
      },
    });
    await dynamodb.put(params);

    await createUniversalEvent({
      recordId: slug!,
      recordType: "gui_widget_record",
      accountId: accountId,
      eventSlug: "delete",
      eventData: {},
      userId: user.slug,
    });

    return {
      statusCode: 200,
      body: { message: "widget deleted successfully" },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(getUser())
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
  .use(
    responseSerializer({
      serializers: [
        {
          regex: /^application\/json$/,
          serializer: ({ body }: any) => JSON.stringify(body),
        },
      ],
      defaultContentType: "application/json",
    })
  )
  .handler(lambdaHandler);
