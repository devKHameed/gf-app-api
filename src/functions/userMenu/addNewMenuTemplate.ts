import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import { AWSError } from "aws-sdk/lib/error";
import { default as createError } from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account, AccountUser } from "types";
import { UserMenuItem, UserMenuTemplate } from "types/UserMenu";
import { USER_MENU_ITEM, USER_MENU_TEMPLATE } from "../../config";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        template_id: {
          type: "number",
        },
        template_name: {
          type: "string",
        },
      },
      required: ["template_id", "template_name"],
    },
  },
  required: ["body"],
} as const;

// Function to generate a unique slug
function generateUniqueSlug(templateName: string): string {
  // Convert template name to lowercase and replace spaces with dashes
  let slug = templateName.toLowerCase().replace(/\s+/g, "-");

  // Generate a random string to append to the slug for uniqueness
  const randomString = Math.random().toString(36).substring(2, 8);

  // Combine the slug and random string
  slug += "-" + randomString;

  return slug;
}

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const { template_name, template_id } = event.body;
  const user = (event as any).user as AccountUser;
  const account = (event as any).account as Account;
  const databaseName = account.database_name;
  if (!user.slug) throw createError("invalid params");

  try {
    const connectionKnex = await connectKnex(databaseName);

    // Get the template to be cloned
    const originalTemplate = await connectionKnex<UserMenuTemplate>(
      USER_MENU_TEMPLATE
    )
      .where({ id: template_id })
      .first();

    if (!originalTemplate) {
      throw createError("Template not found", { statusCode: 404 });
    }

    const slug = generateUniqueSlug(template_name);

    // Create a new template with the provided name
    const newTemplate = await connectionKnex<UserMenuTemplate>(
      USER_MENU_TEMPLATE
    )
      .insert({
        template_name: template_name,
        template_slug: slug, // You can use a function to generate a unique slug
        is_custom: true,
      })
      .returning("id")
      .then(async ([id]) => {
        return await connectionKnex<UserMenuTemplate>(USER_MENU_TEMPLATE)
          .where({ id: id as unknown as number })
          .first();
      })
      .catch(console.log);

    // Get the menu items associated with the original template
    const originalMenuItems = await connectionKnex<UserMenuItem>(USER_MENU_ITEM)
      .where({ parent_menu: template_id })
      .select("*");

    // Clone the menu items for the new template
    const clonedMenuItems = originalMenuItems.map((menuItem) => {
      delete (menuItem as any)?.id;
      return {
        ...menuItem,
        parent_menu: newTemplate?.id,
      };
    });

    // Insert the cloned menu items into the new template
    await connectionKnex<UserMenuItem>(USER_MENU_ITEM).insert(clonedMenuItems);

    return {
      statusCode: 201,
      body: { message: "Template cloned successfully", data: newTemplate },
    };
  } catch (error: unknown) {
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
