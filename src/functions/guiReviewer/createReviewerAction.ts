import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { GFGui } from "types";
import { v4 } from "uuid";
import { envTableNames } from "../../config";
import { dynamodb } from "../../helpers/db";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";
import { createFusion } from "../../util/fusion";

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        action_title: {
          type: "string",
        },
        action_icon: {
          type: "string",
        },
        tab_name: {
          type: "string",
        },
      },
      required: ["action_title", "tab_name"],
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const guiSlug = event.pathParameters!.guiSlug!;
  const { action_title, action_icon, tab_name } = event.body;
  const accountId = event.headers["account-id"]!;

  try {
    const guiRes = await dynamodb.get({
      TableName: envTableNames.DYNAMODB_ACCT_GF_GUIS,
      Key: {
        id: accountId,
        slug: guiSlug,
      },
    });

    if (!guiRes.Item) {
      throw createError(404, `GUI ${guiSlug} not found`);
    }

    const gui = guiRes.Item as GFGui;
    const tabIndex =
      gui.tabs?.findIndex((tab) => tab.tab_name === tab_name) ?? -1;

    if (tabIndex === -1) {
      throw createError(404, `Tab ${tab_name} not found`);
    }

    const fusion = await createFusion(accountId, {
      fusion_title: action_title,
      fusion_icon: action_icon,
      fusion_type: "fusion_action",
      meta_data: {
        gui_slug: guiSlug,
        tab_index: tabIndex,
      },
    });

    const updatedTabs = gui.tabs?.map((tab) => {
      if (tab.tab_name === tab_name && tab.tab_type === "reviewer") {
        return {
          ...tab,
          associated_actions: [
            ...(tab.associated_actions ?? []),
            {
              id: v4(),
              action_title,
              action_icon,
              fusion_slug: fusion.fusion_slug,
            },
          ],
        };
      }

      return tab;
    });

    const { Attributes: updatedGui } = await dynamodb.update(
      buildUpdateExpression({
        tableName: envTableNames.DYNAMODB_ACCT_GF_GUIS,
        keys: {
          id: accountId,
          slug: guiSlug,
        },
        item: {
          tabs: updatedTabs,
        },
        ReturnValues: "ALL_NEW",
      })
    );

    return {
      statusCode: 200,
      body: { message: "update successful", data: updatedGui },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy(lambdaHandler, { timeoutEarlyInMillis: 0 })
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
  .use(jsonschemaErrors())
  .use(httpErrorHandler())
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
  );
