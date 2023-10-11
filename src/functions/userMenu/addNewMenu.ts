import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import { default as createError } from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account, AccountUser } from "types";
import { UserMenuItem, UserMenuTemplate } from "types/UserMenu";
import {
  ACCOUNT_USER_SUBSCRIPTION,
  USER_MENU_ITEM,
  USER_MENU_TEMPLATE,
  envTableNames,
} from "../../config";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import buildUpdateExpression from "../../util/buildUpdateExpression";
const dynamoDb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        template_id: {
          type: ["number", "string"],
        },
        label: {
          type: "string",
        },
        gui_to_link_id: {
          type: "string",
        },
        user_slug: {
          type: "string",
        },
      },
      required: ["label", "gui_to_link_id"],
    },
  },
  required: ["body"], // Insert here all required event properties
} as const;

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { template_id, label, gui_to_link_id, user_slug } = event.body;
  const user = (event as any).user as AccountUser;
  const account = (event as any).account as Account;
  const databaseName = account.database_name;
  const account_id: string = event.headers["account-id"] as string;
  if (!user.slug) throw createError("invalid params");

  try {
    const connectionKnex = await connectKnex(databaseName);

    if (template_id === "custom") {
      const template_slug = `user_${user_slug}`;

      console.log(
        "🚀 ~ file: addNewMenu.ts:55 ~ >= ~ template_slug:",
        template_slug
      );
      await connectionKnex<UserMenuTemplate>(USER_MENU_TEMPLATE)
        .where("template_slug", template_slug)
        .first()
        .then(async (row) => {
          console.log("🚀 ~ file: addNewMenu.ts:60 ~ .then ~ row:", row);
          if (!row) {
            return await connectionKnex<UserMenuTemplate>(USER_MENU_TEMPLATE)
              .insert({
                is_custom: true,
                template_slug: template_slug,
                template_name: `${user.first_name || ""} ${
                  user.last_name || ""
                } template`,
              })
              .then(async () => {
                console.log("🚀 ~ file: addNewMenu.ts:71 ~ .then ~ then:");
                return await connectionKnex<UserMenuTemplate>(
                  USER_MENU_TEMPLATE
                )
                  .where("template_slug", template_slug)
                  .first()
                  .then(async (template) => {
                    if (user_slug) {
                      const params: DynamoDB.DocumentClient.UpdateItemInput =
                        buildUpdateExpression({
                          keys: {
                            id: `${account_id}:${ACCOUNT_USER_SUBSCRIPTION}`,
                            user_id: user_slug,
                          },
                          tableName:
                            envTableNames.DYNAMODB_ACCOUNT_USER_SUBSCRIPTION,
                          item: { template_id: template?.id },
                        });

                      await dynamoDb.update(params).promise();
                      console.log("user updated");
                    }
                    return template;
                  });
              });
          }

          return row;
        })
        .then(async (row) => {
          console.log(
            "🚀 ~ file: addNewMenu.ts:84 ~ .then ~ USER_MENU_ITEM:",
            USER_MENU_ITEM
          );
          await connectionKnex<UserMenuItem>(USER_MENU_ITEM)
            .insert({
              label: label,
              gui_to_link_id,
              parent_menu: row?.id,
            })
            .catch((e) => {
              console.log("🚀 ~ file: addNewMenu.ts:95 ~ .then ~ e:", e);
              return {};
            });
        });
    } else {
      console.log("🚀 ~ file: addNewMenu.ts:91 ~ >= ~ {:");
      await connectionKnex<UserMenuItem>(USER_MENU_ITEM).insert({
        label: label,
        gui_to_link_id,
        parent_menu: template_id as number,
      });
    }

    return {
      statusCode: 201,
      body: { message: "data updated" },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema, ajvOptions: { allowUnionTypes: true } })) // validates the input
  .use(jsonschemaErrors())
  .use(httpErrorHandler())
  .use(getUser())
  .use(getAccountData())
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
  .handler(lambdaHandler); // handles common http errors and returns proper responses
