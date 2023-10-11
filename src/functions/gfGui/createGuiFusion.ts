import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account, AccountUser } from "types";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { createFusion } from "../../util/fusion";

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        gui_slug: {
          type: "string",
        },
        main_tab_id: {
          type: "string",
        },
        sub_tab_id: {
          type: "string",
        },
      },
      required: ["gui_slug", "main_tab_id", "sub_tab_id"],
    },
  },
  required: ["body"],
} as const;

export const RequsetCreateDatasetBody = {
  title: "RequsetCreateDatasetBody",
  RequsetCreateDatasetBody: eventSchema.properties.body,
};

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { gui_slug, main_tab_id, sub_tab_id } = event.body;
  const accountId: string = event.headers["account-id"] as string;
  const account = event.account as Account;
  const user = event.user as AccountUser;
  if (!user.slug) throw createError("user does not exists!");

  try {
    const fusion = await createFusion(accountId, {
      fusion_title: `gui-fusion-${gui_slug}`,
      fusion_type: "data-list-gui-create-form-submit",
      meta_data: {
        gui_slug,
        main_tab_id,
        sub_tab_id,
      },
    });

    return {
      statusCode: 201,
      body: { data: fusion },
    };
  } catch (error: unknown) {
    console.log("error---", error);
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  .use(validator({ eventSchema })) // validates the input
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
