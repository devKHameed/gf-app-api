import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import _, { IsEqualCustomizer } from "lodash";
import getUser from "middleware/getUser";
import { AccountUser } from "types";
import { envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import { Fusion, FusionOperator, SchedulingConfig } from "../../types/Fusion";
import {
  getNextFusionTriggerTime,
  scheduleFusion,
  stopFusionScheduling,
} from "../../util/fusion";

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

const fusionTableName = `${envTableNames.DYNAMODB_ACCT_FUSIONS}`;
const historyTableName = `${envTableNames.DYNAMODB_ACCT_FUSION_HISTORY}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  console.log("Event", JSON.stringify(event, null, 2));
  try {
    const accountId = event.headers["account-id"];
    const body = event.body as Partial<Fusion>;
    const { id = "" } = event.pathParameters || {};

    if (!id) {
      throw {
        message: [{ key: "id", value: "id is required" }],
        code: 421,
      };
    }

    const { Item } = await dynamodb
      .get({
        TableName: fusionTableName,
        Key: {
          id: `${accountId}:fusions`,
          slug: id,
        },
      })
      .promise();
    console.log({ Item });
    if (!Item) {
      throw {
        message: `Fusion doesn't exists against this id=${id}`,
        code: 404,
      };
    }

    if (
      body.fusion_operators?.[0]?.operator_slug ===
        Item?.fusion_operators?.[0]?.operator_slug &&
      Item?.fusion_operators?.[0]?.triggerResponse
    ) {
      _.set(
        body,
        "fusion_operators.0.triggerResponse",
        Item.fusion_operators[0].triggerResponse
      );
    }

    const now = new Date().toISOString();
    const tableParams: DynamoDB.DocumentClient.UpdateItemInput = {
      TableName: fusionTableName,
      UpdateExpression: "",
      ExpressionAttributeValues: {},
      Key: {
        id: `${accountId}:fusions`,
        slug: id,
      },
    };

    let prefix = "set ";
    const attributes = Object.keys(body);
    for (let i = 0; i < attributes.length; i++) {
      const attribute = attributes[i];
      tableParams["UpdateExpression"] +=
        prefix + "" + attribute + " = :" + attribute;
      tableParams["ExpressionAttributeValues"]![":" + attribute] =
        body[attribute as keyof Fusion];
      prefix = ", ";
    }

    tableParams["UpdateExpression"] += prefix + "updated_at" + " = :updated_at";
    tableParams["ExpressionAttributeValues"]![":updated_at"] = now;

    //Fusion Branches and Operators
    if (body.fusion_operators) {
      if (
        tableParams["ExpressionAttributeValues"]![":operator_count"] == null
      ) {
        tableParams["UpdateExpression"] +=
          prefix + "operator_count" + " = :operator_count";
      }
      tableParams["ExpressionAttributeValues"]![":operator_count"] = (
        body.fusion_operators as unknown[]
      ).length;

      if (tableParams["ExpressionAttributeValues"]![":branch_count"] == null) {
        tableParams["UpdateExpression"] +=
          prefix + "branch_count" + " = :branch_count";
      }
      tableParams["ExpressionAttributeValues"]![":branch_count"] =
        getBranchCount(body.fusion_operators);
    }

    await dynamodb.update(tableParams).promise();
    await handleFusionScheduling(
      body,
      Item as Fusion,
      (event.user as AccountUser).slug
    );

    const { Count: fusion_history_count = 0 } = await dynamodb
      .query({
        TableName: historyTableName,
        FilterExpression: "#is_deleted = :is_deleted",
        KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
        ExpressionAttributeNames: {
          "#id": "id",
          "#slug": "slug",
          "#is_deleted": "is_deleted",
        },
        ExpressionAttributeValues: {
          ":id": `${accountId}:fusions_history`,
          ":slug": `${id}:`,
          ":is_deleted": false,
        },
        // Limit: Number(limit),
        // ...filterSchema
      })
      .promise();

    Item.id = `${accountId}:fusions_history`;
    Item.slug = `${id}:${Date.parse(now)}`;
    Item.version = fusion_history_count + 1;
    Item.created_at = now;
    Item.updated_at = now;

    if (body.fusion_title) {
      Item.fusion_title = body.fusion_title;
    }
    if (body.fusion_type) {
      Item.fusion_type = body.fusion_type;
    }
    if (body.fusion_tags) {
      Item.fusion_tags = body.fusion_tags;
    }
    if (body.input_vars) {
      Item.input_vars = body.input_vars;
    }
    if (body.output_vars) {
      Item.output_vars = body.output_vars;
    }
    if (body.schedule_type) {
      Item.schedule_type = body.schedule_type;
    }
    if (body.minute_count) {
      Item.minute_count = body.minute_count;
    }
    if (body.days_of_week) {
      Item.days_of_week = body.days_of_week;
    }
    if (body.date_of_month) {
      Item.date_of_month = body.date_of_month;
    }
    if (body.dataset_slug) {
      Item.dataset_slug = body.dataset_slug;
    }
    if (body.fusion_status) {
      Item.fusion_status = body.fusion_status;
    }
    if (body.fusion_operators) {
      Item.fusion_operators = body.fusion_operators;
      //Fusion Branches and Operators
      Item.operator_count = body.fusion_operators.length;
      Item.branch_count = getBranchCount(body.fusion_operators);
    }
    if (body.is_active) {
      Item.is_active = body.is_active;
    }
    if (body.event_slug) {
      Item.is_active = body.event_slug;
    }
    if (body.event_source_slug) {
      Item.is_active = body.event_source_slug;
    }
    if (body.fusion_fields) {
      Item.fusion_fields = body.fusion_fields;
    }

    const tableParamsHistory = {
      TableName: historyTableName,
      Item: Item,
    };

    await dynamodb.put(tableParamsHistory).promise();

    return {
      statusCode: 200,
      body: {
        message: "Table updated successfully",
      },
    };
  } catch (e) {
    throw createHttpError(500, e as Error, { expose: true });
  }
};

export const handler = middy()
  .use(jsonBodyParser()) // parses the request body when it's a JSON and converts it to an object
  // .use(validator({ eventSchema })) // validates the input
  .use(getUser())
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

const getBranchCount = (fusionOperators: FusionOperator[]) => {
  let maxBranches = 1;
  for (const operator of fusionOperators) {
    let branches = 0;
    for (const child of fusionOperators) {
      if (child.parent_operator_slug === operator.operator_slug) {
        branches += 1;
      }
      if (branches > maxBranches) {
        maxBranches = branches;
      }
    }
  }
  return maxBranches;
};

const handleFusionScheduling = async (
  updateValues: Partial<Fusion>,
  oldFusion: Fusion,
  userSlug: string
) => {
  if (oldFusion.is_active) {
    if (_.has(updateValues, "is_active") && !updateValues.is_active) {
      await stopFusionScheduling(updateValues.slug!);
      return;
    }

    if (
      updateValues.scheduling &&
      isSchedulingChanged(updateValues.scheduling, oldFusion.scheduling)
    ) {
      await stopFusionScheduling(oldFusion.slug!);
      const timestamp = getNextFusionTriggerTime(updateValues.scheduling);
      if (timestamp) {
        await scheduleFusion(
          oldFusion.slug!,
          timestamp.format(),
          oldFusion.account_id!,
          userSlug
        );
      }
      return;
    }
  } else {
    if (
      _.has(updateValues, "is_active") &&
      updateValues.is_active &&
      (updateValues.scheduling || oldFusion.scheduling)
    ) {
      const timestamp = getNextFusionTriggerTime(
        updateValues.scheduling || oldFusion.scheduling!
      );
      if (timestamp) {
        await scheduleFusion(
          oldFusion.slug!,
          timestamp.format(),
          oldFusion.account_id!,
          userSlug
        );
      }
      return;
    }
  }
};

const isSchedulingChanged = (
  newScheduling: SchedulingConfig,
  oldScheduling?: SchedulingConfig
): boolean => {
  if (!oldScheduling) {
    return true;
  }

  if (oldScheduling.type !== newScheduling.type) {
    return true;
  }

  const customizer: IsEqualCustomizer = (v, o) => {
    if (Array.isArray(v) && Array.isArray(o)) {
      if (!_.isPlainObject(v[0]) && !_.isPlainObject(o[0])) {
        return v.every((i) => o.includes(i)) && o.every((i) => v.includes(i));
      } else {
        return (
          v.every((i) => o.some((j) => _.isEqualWith(i, j, customizer))) &&
          o.every((i) => v.some((j) => _.isEqualWith(i, j, customizer)))
        );
      }
    }
  };

  return !_.isEqualWith(newScheduling, oldScheduling, customizer);
};
