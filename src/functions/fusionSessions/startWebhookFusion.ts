import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import _ from "lodash";
import { ThreePAppWebhook } from "types";
import { Fusion } from "types/Fusion";
import { envTableNames } from "../../config";
import { FusionLambda } from "../../constants/3pApp";
import { InvocationType } from "../../enums/lambda";
import { getFunctions, parseExpression } from "../../helpers/3pExpression";
import { parseResponseConfig } from "../../helpers/3pModule";
import { invokeLambda } from "../../helpers/lambda";
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

const webhookTableName = `${envTableNames.DYNAMODB_ACCT_FUSION_WEBHOOK}`;
const fusionTableName = `${envTableNames.DYNAMODB_ACCT_FUSIONS}`;
const sessionTableName = `${envTableNames.DYNAMODB_ACCT_FUSION_SESSION_V2}`;
const webhook3pTableName = `${envTableNames.DYNAMODB_ACCT_3P_APP_WEBHOOKS}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  console.log(
    "🚀 ~ file: startWebhookFusion.ts:39 ~ >= ~ event",
    JSON.stringify(event, null, 2)
  );
  try {
    const headers = event.headers;
    const { id: accountId = "" } = event.pathParameters || {};
    const { id = "" } = event.queryStringParameters || {};

    if (!id) {
      throw createHttpError(421, new Error("id is required"), { expose: true });
    }

    const body = event.body;
    let isShared = false;
    const type = "fusion_connection_slug";
    let fusionResponse;
    //let errors_list = [];
    let webhookOperatorData: Record<string, unknown> = {};
    let successfulCalls = 0;
    let waitForResponse = false;

    const { Item } = await dynamodb
      .get({
        TableName: webhookTableName,
        Key: {
          id: `${accountId}:fusion_webhooks`,
          slug: id,
        },
      })
      .promise();
    // .query({
    //   TableName: webhookTableName,
    //   FilterExpression: "#is_deleted = :is_deleted AND #url_uuid = :url_uuid",
    //   KeyConditionExpression: "#id = :id",
    //   ExpressionAttributeNames: {
    //     "#is_deleted": "is_deleted",
    //     "#id": "id",
    //     "#url_uuid": "url_uuid",
    //   },
    //   ExpressionAttributeValues: {
    //     ":id": `${accountId}:fusion_webhooks`,
    //     ":is_deleted": false,
    //     ":url_uuid": id,
    //   },
    // })
    // .promise();
    if (!Item) {
      throw createHttpError(
        400,
        new Error(`Webhook doesn't exists against this id=${id}`),
        { expose: true }
      );
    }

    //let Item = webhooks.Items[0];

    //Get required values
    const webhookSlug: string = Item.slug;
    const userId: string = Item.user_id;
    const sessionInitVars: Record<string, unknown> =
      Item.session_int_vars || {};
    const webhookUrl: string = Item.webhook_url;
    const getRequestHttpMethod = Item.get_request_http_method || "";
    const getRequestHeaders = Item.get_request_headers || {};
    webhookOperatorData = { data: body, payload: body };
    let isGlobal = false;
    if (Item.module_slug === "system") {
      if (Item.data_structure) {
        const isStrict: boolean = Item.data_structure.strict || false;
        console.log(`Value of string: ${isStrict}`);
        const validStructure = await validatePayload(
          body,
          Item.data_structure as Record<string, unknown>,
          isStrict
        );
        if (!validStructure) {
          throw createHttpError(431, new Error("Payload stucture mismatch"), {
            expose: true,
          });
        }
      }

      console.log("setting type to slug");

      // type = "webhook_slug";
      webhookOperatorData = { data: body };
      if (getRequestHttpMethod) {
        webhookOperatorData["request_method"] = event.httpMethod;
      }
      if (getRequestHeaders) {
        webhookOperatorData["request_headers"] = event.headers;
      }
    } else {
      const webhook3pSlug = Item.webhook_slug;
      let webhook = await dynamodb
        .get({
          TableName: webhook3pTableName,
          Key: {
            id: `${accountId}:3p_app_webhooks`,
            slug: webhook3pSlug,
          },
        })
        .promise()
        .then((res) => res.Item as ThreePAppWebhook);
      if (!webhook) {
        webhook = await dynamodb
          .get({
            TableName: webhook3pTableName,
            Key: {
              id: "3p:global:3p_app_webhooks",
              slug: webhook3pSlug,
            },
          })
          .promise()
          .then((res) => res.Item as ThreePAppWebhook);
        isGlobal = true;
      }
      const communication = webhook.incoming_communication;
      const verification = communication.verification;
      const moduleSlug = Item.module_slug as string;
      const appSlug = `${moduleSlug.split(":")[0]}:${moduleSlug.split(":")[1]}`;
      const gfmlFunctions = await getFunctions(appSlug, accountId);
      if (verification) {
        const condition = await parseExpression(verification.condition, {
          body: { body, headers },
          accountId,
          functions: gfmlFunctions,
        });
        if (condition) {
          const respond: any = await parseExpression(verification.respond, {
            body: { body, headers },
            accountId,
            app: appSlug,
          });
          let responseBody = respond.body;
          if (respond.type === "urlencoded" && responseBody) {
            responseBody =
              typeof responseBody === "string"
                ? encodeURIComponent(responseBody)
                : encodeURIComponent(JSON.stringify(responseBody));
          }
          const verificationResponse: Record<string, unknown> = {
            statusCode: 200,
          };
          if (respond.headers) {
            verificationResponse.headers = respond.headers;
          }

          if (responseBody) {
            verificationResponse.body = responseBody;
          }
          console.log(
            "🚀 ~ file: startWebhookFusion.ts:190 ~ >= ~ verificationResponse",
            verificationResponse
          );

          return verificationResponse;
        }
      }
      const webhookData = (await parseResponseConfig({
        responseObject: _.omit(communication, [
          "verification",
          "respond",
        ]) as any,
        appSlug,
        options: {
          body: { body, parameters: Item.parameters },
          accountId,
          functions: gfmlFunctions,
        },
        accountId,
      })) as Record<string, unknown>;
      console.log(
        "🚀 ~ file: startWebhookFusion.ts:195 ~ >= ~ webhookData",
        webhookData
      );
      webhookOperatorData.data = webhookData;
      webhookOperatorData.payload = webhookData;
    }
    //let module_slug = Item.module_slug;
    if (webhookUrl.includes("shared")) {
      isShared = true;
    }

    //console.log('Final Webhook Data', webhook_operator_data);
    const fusions = await getFusions(webhookSlug, type, accountId);
    // if (fusions?.length === 0) {
    //   throw createHttpError(
    //     404,
    //     new Error(
    //       `Fusions doesn't exists against this app_module=${webhookSlug}`
    //     ),
    //     { expose: true }
    //   );
    // }
    for (const fusionItem of fusions) {
      waitForResponse = responseWait(fusionItem);
      const fusion: Partial<Fusion> = {};
      fusion["fusion_operators"] = fusionItem.fusion_operators;
      fusion["account_id"] = fusionItem.account_id;
      fusionResponse = await makeLambdaCalls(
        fusionItem,
        { ...sessionInitVars, ...webhookOperatorData },
        userId,
        accountId,
        fusion,
        webhookOperatorData
      );
      successfulCalls += 1;
    }

    if (!waitForResponse) {
      return {
        statusCode: 200,
        body: {
          message: "Request Processed!",
          totalCalls: successfulCalls,
          shared: isShared,
        },
      };
    } else {
      //Try to get payload
      console.log(
        "Start polling for response: fusion_response: ",
        JSON.stringify(fusionResponse, null, 2)
      );
      const sessionSlug = JSON.parse(fusionResponse?.Payload as string);
      const finalPayload = await getPayload(`${sessionSlug}`, accountId);
      console.log("This was final payload", finalPayload);
      if (_.has(finalPayload, "EmptyMessage")) {
        console.log("Empty Message");
        return {
          statusCode: 200,
          body: finalPayload,
        };
      } else {
        console.log("Not Empty Message");
        let status = finalPayload?.status as number;
        if (isNaN(status)) {
          status = 200;
        }
        console.log("Status: ", status);
        const headers = finalPayload?.headers;
        const response: Record<string, unknown> = {};
        if (headers) {
          _.set(response, "headers", headers);
        }
        console.log("Headers: ", headers);
        _.set(response, "body", finalPayload?.body);
        console.log("Body: ", response.body);
        console.log("sending response: ", status, response.body);
        return {
          statusCode: status,
          headers: response.headers,
          body: response.body,
        };
      }
    }
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
};

async function validatePayload(
  payload: Record<string, unknown>,
  structure: Record<string, unknown>,
  isStrict: boolean
) {
  //if strict
  const specifications = structure.specifications as {
    name: string;
    type: string;
    required: boolean;
  }[];
  if (isStrict) {
    //Check if extra
    const payloadKeys = Object.keys(payload);
    const structureKeys: string[] = [];
    console.log("Payload Keys: ", payloadKeys.length);
    for (const item of specifications) {
      structureKeys.push(item.name);
    }
    if (payloadKeys.length > structureKeys.length) {
      console.log("Extra Keys in Payload found");
      return false;
    }
    console.log("Structure Keys: ", structureKeys.length);
  }
  //Check Length
  for (const item of specifications) {
    if (Object.prototype.hasOwnProperty.call(payload, item.name)) {
      const typeMatch = await validateType(item.type, payload[item.name], item);
      if (!typeMatch) {
        console.log("Wrong type recieved for: " + item.name);
        return false;
      }
    } else if (!item.required) {
      console.log("Item ignored for not being required: " + item.name);
    } else {
      console.log("Item not found: " + item.name);
      return false;
    }
  }
  return true;
}

async function validateType(
  struct: string,
  payload: unknown,
  completed: Record<string, unknown>
) {
  console.log(struct, payload);
  if (struct === "array") {
    if (Array.isArray(payload)) {
      if (completed.array_specifications) {
        const nested = await validateType(
          (completed.array_specifications as { type: string }).type,
          payload[0],
          completed.array_specifications as Record<string, unknown>
        );
        if (!nested) {
          console.log(
            "Wrong nested items at: ",
            (completed.array_specifications as { type: string }).type,
            payload[0]
          );
          return false;
        }
      }
      return true;
    }
    console.log("Wrong type at: ", struct, payload);
    return false;
  } else if (struct === "text" || struct === "string") {
    if (typeof payload === "string") {
      return true;
    }
    console.log("Wrong type at: ", struct, payload);
    return false;
  } else if (struct === "collection") {
    if (_.isPlainObject(payload)) {
      if (completed.collection_specifications) {
        for (const collection of completed["collection_specifications"] as {
          type: string;
          name: string;
        }[]) {
          const nested = await validateType(
            collection.type,
            (payload as Record<string, unknown>)[collection.name],
            collection
          );
          if (!nested) {
            console.log(
              "Wrong nested items at:",
              collection.type,
              (payload as Record<string, unknown>)[collection.name]
            );
            return false;
          }
        }
      }
      return true;
    }
    console.log("Wrong type at: ", struct, payload);
    return false;
  } else if (struct === "number") {
    if (typeof payload === "number") {
      return true;
    }
    console.log("Wrong type at: ", struct, payload);
    return false;
  } else if (struct === "boolean") {
    if (typeof payload === "boolean") {
      return true;
    }
    console.log("Wrong type at: ", struct, payload);
    return false;
  } else if (struct === "date") {
    // TODO: what is this supposed to be?
    // if (Object.prototype.toString.call(payload) === "[object Date]") {
    //   return true;
    // }
    if (_.isDate(payload)) {
      return true;
    }
    if (typeof payload === "number") {
      return true;
    }

    console.log("Wrong type at: ", struct, payload);
    return false;
  } else if (struct === "binary_data") {
    const isBinary = checkBinary(payload as string);
    if (isBinary) {
      return true;
    }
    console.log("Wrong type at: ", struct, payload);
    return false;
  }
  return false;
}

function checkBinary(str: string) {
  let isBinary = false;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "0" || str[i] === "1") {
      isBinary = true;
    } else {
      isBinary = false;
    }
  }
  return isBinary;
}

async function getFusions(
  webhookSlug: string,
  type: string,
  accountId: string
) {
  console.log(
    "🚀 ~ file: startWebhookFusion.ts ~ line 358 ~ accountId",
    accountId
  );
  console.log("🚀 ~ file: startWebhookFusion.ts ~ line 358 ~ type", type);
  console.log(
    "🚀 ~ file: startWebhookFusion.ts ~ line 358 ~ webhookSlug",
    webhookSlug
  );
  console.log("slug", webhookSlug);
  let Items = await dynamodb
    .query({
      TableName: fusionTableName,
      FilterExpression: "#is_deleted = :is_deleted",
      KeyConditionExpression: "#id = :id",
      ExpressionAttributeNames: {
        "#is_deleted": "is_deleted",
        "#id": "id",
      },
      ExpressionAttributeValues: {
        ":id": `${accountId}:fusions`,
        ":is_deleted": 0,
        // ":slug": webhookSlug,
      },
      ConsistentRead: true,
    })
    .promise()
    .then((res) => (res.Items || []) as Fusion[]);
  console.log(
    "🚀 ~ file: startWebhookFusion.ts:472 ~ fusions",
    JSON.stringify(Items, null, 2)
  );
  Items = Items.filter(
    (i) =>
      i.fusion_operators?.[0]?.operator_input_settings?.[`${type}`] ===
      webhookSlug
  );

  console.log("Data", JSON.stringify(Items, null, 2));
  return Items || [];
}

async function makeLambdaCalls(
  fusionItem: Partial<Fusion>,
  sessionInitVars: Record<string, unknown>,
  userId: string,
  accountId: string,
  fusion: Partial<Fusion>,
  webhookOperatorData: unknown
) {
  //Get Related Information Here
  const params = {
    fusionSlug: fusionItem.slug,
    sessionInitVars,
    userId,
    accountId,
    fusion: fusion,
    webhookOpData: webhookOperatorData,
  };

  return await invokeLambda(
    FusionLambda.SessionInt,
    params,
    InvocationType.RequestResponse,
    { roundRobin: true }
  );
}

async function getPayload(sessionSlug: string, accountId: string) {
  let complete = false;
  while (!complete) {
    const { Item: session } = await dynamodb
      .get({
        TableName: sessionTableName,
        Key: { id: `${accountId}:fusion_sessions`, slug: sessionSlug },
      })
      .promise();
    if (session?.final_payload) {
      complete = true;
      return session.final_payload as Record<string, unknown>;
    }
  }
}

function responseWait(fusion: Partial<Fusion>) {
  return !!fusion.fusion_operators?.find(
    (op) => op.app === "system" && op.app_module === "webhook_response"
  );
}

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
