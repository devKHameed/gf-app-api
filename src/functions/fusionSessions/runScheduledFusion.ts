import middy from "@middy/core";
import type { EventBridgeHandler } from "aws-lambda";
import DynamoDB from "aws-sdk/clients/dynamodb";
import createHttpError from "http-errors";
import moment from "moment";
import { envTableNames, FUSION_SCHEDULES_TABLE_NAME } from "../../config";
import { FusionLambda } from "../../constants/3pApp";
import { ScheduleType } from "../../enums/fusion";
import { InvocationType } from "../../enums/lambda";
import { dynamodb } from "../../helpers/db";
import { invokeLambda } from "../../helpers/lambda";
import mainDbInitializer from "../../middleware/mainDbInitializer";
import { ScheduledFusion, SchedulingConfig } from "../../types";
import {
  getFusion,
  getNextFusionTriggerTime,
  scheduleFusion,
  updateScheduledFusionStatus,
} from "../../util/fusion";

// const dynamodb = getMainAccountDb();

const ScheduledFusionsTableName = envTableNames.DYNAMODB_SCHEDULED_FUSIONS_V2;

export const lambdaHandler: EventBridgeHandler<"", unknown, void> = async (
  event
) => {
  // console.log("event", event);

  if (!event.time) {
    throw new createHttpError.InternalServerError("Missing time");
  }

  const lambdaTime = moment.utc(`${event.time}`);
  // console.log(
  //   "🚀 ~ file: runScheduledFusion.ts ~ line 16 ~ lambdaTime",
  //   lambdaTime.format("YYYY-MM-DDTHH:mm")
  // );

  const scheduledFusions = await getScheduledFusions(
    lambdaTime.format("YYYY-MM-DDTHH:mm")
  );
  // console.log(
  //   "🚀 ~ file: runScheduledFusion.ts ~ line 44 ~ scheduledFusions",
  //   JSON.stringify(scheduledFusions, null, 2)
  // );

  for (const scheduledFusion of scheduledFusions) {
    const fusion = await getFusion(
      scheduledFusion.fusion_slug,
      scheduledFusion.account_id
    );
    // console.log(
    //   '🚀 ~ file: runScheduledFusion.ts ~ line 47 ~ consthandler:EventBridgeHandler<"",unknown,void>= ~ fusion',
    //   fusion
    // );
    if (fusion) {
      if (
        fusion.scheduling &&
        isTimestampValid(scheduledFusion.slug, fusion.scheduling)
      ) {
        // console.log("Invoking Lambda: ", {
        //   fusionSlug: fusion.slug,
        //   sessionInitVars: {},
        //   userId: scheduledFusion.user_id,
        //   fusion,
        //   accountId: fusion.account_id,
        // });
        await invokeLambda(
          FusionLambda.SessionInt,
          {
            fusionSlug: fusion.slug,
            sessionInitVars: {},
            userId: scheduledFusion.user_id,
            fusion,
            accountId: fusion.account_id,
          },
          InvocationType.RequestResponse
        );
      }

      // console.log("updating status");
      await updateScheduledFusionStatus(scheduledFusion.slug, "Complete");

      if (
        fusion.scheduling?.type &&
        fusion.scheduling?.type !== ScheduleType.Once
      ) {
        const nextTriggerTime = getNextFusionTriggerTime(
          fusion.scheduling,
          lambdaTime.format()
        );
        // console.log(
        //   '🚀 ~ file: runScheduledFusion.ts ~ line 80 ~ consthandler:EventBridgeHandler<"",unknown,void>= ~ nextTriggerTime',
        //   nextTriggerTime
        // );
        if (nextTriggerTime) {
          // console.log(
          //   "scheduleFusion",
          //   fusion.slug,
          //   nextTriggerTime.format(),
          //   fusion.account_id
          // );
          await scheduleFusion(
            fusion.slug!,
            nextTriggerTime.format(),
            fusion.account_id!,
            scheduledFusion.user_id
          );
        }
      }
    }
  }
};

const getScheduledFusions = async (
  slugPrefix: string,
  lastEvaluatedKey?: DynamoDB.DocumentClient.Key
): Promise<ScheduledFusion[]> => {
  const { Items = [], LastEvaluatedKey } = await dynamodb.query({
    TableName: ScheduledFusionsTableName,
    KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
    FilterExpression: "#status = :status",
    ExpressionAttributeNames: {
      "#id": "id",
      "#slug": "slug",
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":id": FUSION_SCHEDULES_TABLE_NAME,
      ":slug": slugPrefix,
      ":status": "Pending",
    },
    ExclusiveStartKey: lastEvaluatedKey,
  });
  if (!LastEvaluatedKey) {
    return Items as ScheduledFusion[];
  } else {
    const moreItems = await getScheduledFusions(slugPrefix, LastEvaluatedKey);
    return [...(Items as ScheduledFusion[]), ...moreItems];
  }
};

const isTimestampValid = (
  timestamp: string,
  config: SchedulingConfig
): boolean => {
  if (
    config.type !== "indefinitely" ||
    !config.restrict ||
    config.restrict.length === 0
  ) {
    return true;
  }

  const mTimestamp = moment.utc(timestamp, moment.defaultFormatUtc);
  return config.restrict.some((restriction) => {
    if (
      restriction.days &&
      restriction.days.length > 0 &&
      !restriction.days.includes(mTimestamp.day())
    ) {
      return false;
    }

    if (
      restriction.months &&
      restriction.months.length > 0 &&
      !restriction.months.includes(mTimestamp.month())
    ) {
      return false;
    }

    if (restriction.time?.from) {
      const [hours, minutes] = restriction.time.from
        .split(":")
        .map((s) => parseInt(s));
      if (
        mTimestamp.hours() < hours ||
        (mTimestamp.hours() === hours && mTimestamp.minutes() < minutes)
      ) {
        return false;
      }
    }

    if (restriction.time?.to) {
      const [hours, minutes] = restriction.time.to
        .split(":")
        .map((s) => parseInt(s));
      if (
        mTimestamp.hours() > hours ||
        (mTimestamp.hours() === hours && mTimestamp.minutes() > minutes)
      ) {
        return false;
      }
    }

    return true;
  });
};

export const handler = middy().use(mainDbInitializer()).handler(lambdaHandler);
