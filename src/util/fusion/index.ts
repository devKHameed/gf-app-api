/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { DynamoDB } from "aws-sdk";
import moment from "moment";
import { v4 } from "uuid";
import {
  envTableNames,
  FOLDERS,
  FUSION_SCHEDULES_TABLE_NAME,
} from "../../config";
import { EdgeConditionOperators, ScheduleType } from "../../enums/fusion";
import { dynamodb } from "../../helpers/db";
import {
  DailyScheduling,
  Fusion,
  FusionOperator,
  IndefiniteScheduling,
  MonthlyScheduling,
  ScheduledFusion,
  SchedulingConfig,
  WeeklyScheduling,
  YearlyScheduling,
} from "../../types";
import buildUpdateExpression from "../../util/buildUpdateExpression";

// const dynamodb = getMainAccountDb();

const scheduledFusionsTableName = `${envTableNames.DYNAMODB_SCHEDULED_FUSIONS_V2}`;

export const scheduleFusion = async (
  fusionSlug: string,
  timestamp: string,
  accountId: string,
  userId: string
) => {
  await dynamodb.put({
    TableName: scheduledFusionsTableName,
    Item: {
      id: FUSION_SCHEDULES_TABLE_NAME,
      slug: timestamp,
      fusion_slug: fusionSlug,
      status: "Pending",
      account_id: accountId,
      user_id: userId,
    },
  });
};

export const stopFusionScheduling = async (slug: string) => {
  const scheduledItems = await getScheduledFusions(slug, "Pending");
  for (const item of scheduledItems) {
    await updateScheduledFusionStatus(item.slug, "Stopped");
  }
};

const getInitialTimestamp = (start?: string, base?: string) => {
  let timestamp = moment.utc();

  if (base) {
    timestamp = moment.utc(base, moment.defaultFormatUtc);
  }

  if (
    start &&
    moment.utc(start, moment.defaultFormatUtc).isAfter(timestamp, "minutes")
  ) {
    timestamp = moment.utc(start, moment.defaultFormatUtc);
  }

  return timestamp;
};

const scheduleForIndefinitely = (
  config: IndefiniteScheduling,
  baseTime?: string
) => {
  const { interval, start, end } = config;
  const timestamp = getInitialTimestamp(start, baseTime);
  console.log("🚀 ~ file: index.ts:69 ~ timestamp:", timestamp.format());

  const base = baseTime
    ? moment.utc(baseTime, moment.defaultFormatUtc)
    : moment.utc();

  console.log("🚀 ~ file: index.ts:72 ~ base:", base.format());
  if (
    !start ||
    moment.utc(start, moment.defaultFormatUtc).isBefore(base, "minutes")
  ) {
    console.log("adding interval:", interval);
    timestamp.add(interval, "m");
    console.log("🚀 ~ file: index.ts:82 ~ timestamp:", timestamp.format());
  }

  if (end && !timestamp.isBefore(moment.utc(end))) {
    console.log("returning end");
    return;
  }

  return timestamp;
};

const scheduleForDaily = (config: DailyScheduling, baseTime?: string) => {
  const { time, start, end } = config;
  const [hours, minutes] = time.split(":").map((i) => parseInt(i));
  const timestamp = getInitialTimestamp(start, baseTime);
  timestamp.hours(hours);
  timestamp.minutes(minutes);

  if (
    timestamp.isSame(moment.utc(), "date") &&
    (hours < moment.utc().hours() ||
      (hours === moment.utc().hours() && minutes < moment.utc().minutes()))
  ) {
    timestamp.add(1, "day");
  }

  if (end && timestamp.isAfter(moment.utc(end))) {
    return;
  }

  return timestamp;
};

const scheduleForWeekly = (config: WeeklyScheduling, baseTime?: string) => {
  const { time, start, end, days = [] } = config;
  const [hours, minutes] = time.split(":").map((i) => parseInt(i));
  const timestamp = getInitialTimestamp(start, baseTime);

  if (days.length === 0) {
    return;
  }

  const dayToSchedule =
    days.sort((a, b) => a - b).find((d) => d >= timestamp.day()) ||
    Math.min(...days);

  timestamp.day(
    dayToSchedule < timestamp.day() ? dayToSchedule + 7 : dayToSchedule
  );

  timestamp.hours(hours);
  timestamp.minutes(minutes);

  if (
    timestamp.isSame(moment.utc(), "date") &&
    (hours < moment.utc().hours() ||
      (hours === moment.utc().hours() && minutes < moment.utc().minutes()))
  ) {
    timestamp.add(1, "day");
  }

  if (end && timestamp.isAfter(moment.utc(end))) {
    return;
  }

  return timestamp;
};

const scheduleForMonthly = (config: MonthlyScheduling, baseTime?: string) => {
  const { time, start, end, dates = [] } = config;
  const [hours, minutes] = time.split(":").map((i) => parseInt(i));
  const timestamp = getInitialTimestamp(start, baseTime);

  if (dates.length === 0) {
    return;
  }

  timestamp.hours(hours);
  timestamp.minutes(minutes);

  if (
    timestamp.isSame(moment.utc(), "date") &&
    (hours < moment.utc().hours() ||
      (hours === moment.utc().hours() && minutes < moment.utc().minutes()))
  ) {
    timestamp.add(1, "day");
  }

  console.log({ t: timestamp.format() });

  const dateToSchedule =
    dates.sort((a, b) => a - b).find((d) => d >= timestamp.date()) ||
    Math.min(...dates);

  if (dateToSchedule < timestamp.date()) {
    timestamp.add(1, "month");
  }
  timestamp.date(dateToSchedule);

  if (end && timestamp.isAfter(moment.utc(end))) {
    return;
  }

  return timestamp;
};

const scheduleForYearly = (config: YearlyScheduling, baseTime?: string) => {
  const { time, start, end, dates = [], months = [] } = config;
  const [hours, minutes] = time.split(":").map((i) => parseInt(i));
  const timestamp = getInitialTimestamp(start, baseTime);

  if (dates.length === 0 || months.length === 0) {
    return;
  }

  timestamp.hours(hours);
  timestamp.minutes(minutes);

  if (
    timestamp.isSame(moment.utc(), "date") &&
    (hours < moment.utc().hours() ||
      (hours === moment.utc().hours() && minutes < moment.utc().minutes()))
  ) {
    timestamp.add(1, "day");
  }

  const dateToSchedule =
    dates.sort((a, b) => a - b).find((d) => d >= timestamp.date()) ||
    Math.min(...dates);

  if (dateToSchedule < timestamp.date()) {
    timestamp.add(1, "month");
  }
  timestamp.date(dateToSchedule);

  const monthToSchedule =
    months.sort((a, b) => a - b).find((d) => d >= timestamp.month()) ||
    Math.min(...months);

  if (monthToSchedule < timestamp.month()) {
    timestamp.add(1, "year");
  }
  timestamp.month(monthToSchedule);

  if (end && timestamp.isAfter(moment.utc(end))) {
    return;
  }

  return timestamp;
};

export const getNextFusionTriggerTime = (
  config: SchedulingConfig,
  baseTime?: string
) => {
  switch (config.type) {
    case ScheduleType.Once:
      return moment.utc(config.date);
    case ScheduleType.Indefinitely:
      return scheduleForIndefinitely(config, baseTime);
    case ScheduleType.Daily:
      return scheduleForDaily(config, baseTime);
    case ScheduleType.Weekly:
      return scheduleForWeekly(config, baseTime);
    case ScheduleType.Monthly:
      return scheduleForMonthly(config, baseTime);
    case ScheduleType.Yearly:
      return scheduleForYearly(config, baseTime);
  }
};

export const getScheduledFusions = async (
  fusionSlug: string,
  status: ScheduledFusion["status"]
) => {
  const { Items = [] } = await dynamodb.query({
    TableName: scheduledFusionsTableName,
    IndexName: "fusion_slug_status_gsi",
    KeyConditionExpression: "#fusion_slug = :fusion_slug AND #status = :status",
    ExpressionAttributeNames: {
      "#fusion_slug": "fusion_slug",
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":fusion_slug": fusionSlug,
      ":status": status,
    },
  });

  return Items as ScheduledFusion[];
};

export const updateScheduledFusionStatus = async (
  slug: string,
  status: ScheduledFusion["status"]
) => {
  await dynamodb.delete({
    TableName: scheduledFusionsTableName,
    Key: {
      id: FUSION_SCHEDULES_TABLE_NAME,
      slug: slug,
    },
    // UpdateExpression: "SET #status = :status",
    // ExpressionAttributeNames: {
    //   "#status": "status",
    // },
    // ExpressionAttributeValues: {
    //   ":status": status,
    // },
  });
};

export const getFusion = async (slug: string, accountId: string) => {
  const { Item } = await dynamodb.get({
    TableName: `${envTableNames.DYNAMODB_ACCT_FUSIONS}`,
    Key: { id: `${accountId}:fusions`, slug },
  });

  return !Item || Item.is_deleted ? undefined : (Item as Fusion);
};

export const validateCondition = (condition: { a: any; b: any; o: string }) => {
  console.log(
    "🚀 ~ file: executeOperator.ts:194 ~ validateCondition ~ condition:",
    condition
  );

  if (!condition.a && !condition.b) {
    return true;
  }

  switch (condition.o as EdgeConditionOperators) {
    case EdgeConditionOperators.Exists:
      return !!condition.a;
    case EdgeConditionOperators.NotExists:
      return !condition.a;
    case EdgeConditionOperators.TextEqual:
    case EdgeConditionOperators.NumberEqual:
    case EdgeConditionOperators.BooleanEqual:
      return condition.a === condition.b;
    case EdgeConditionOperators.TextEqualCI:
      return condition.a?.toLowerCase() === condition.b?.toLowerCase();
    case EdgeConditionOperators.TextNotEqual:
    case EdgeConditionOperators.NumberNotEqual:
    case EdgeConditionOperators.BooleanNotEqual:
      return condition.a !== condition.b;
    case EdgeConditionOperators.TextNotEqualCI:
      return condition.a?.toLowerCase() !== condition.b?.toLowerCase();
    case EdgeConditionOperators.TextContains:
      return condition.a?.includes(condition.b);
    case EdgeConditionOperators.TextContainsCI:
      return condition.a?.toLowerCase().includes(condition.b?.toLowerCase());
    case EdgeConditionOperators.TextNotContains:
      return !condition.a?.includes(condition.b);
    case EdgeConditionOperators.TextNotContainsCI:
      return !condition.a?.toLowerCase().includes(condition.b?.toLowerCase());
    case EdgeConditionOperators.TextStartWith:
      return condition.a?.startsWith(condition.b);
    case EdgeConditionOperators.TextStartWithCI:
      return condition.a?.toLowerCase().startsWith(condition.b?.toLowerCase());
    case EdgeConditionOperators.TextNotStartWith:
      return !condition.a.startsWith(condition.b);
    case EdgeConditionOperators.TextNotStartWithCI:
      return !condition.a?.toLowerCase().startsWith(condition.b?.toLowerCase());
    case EdgeConditionOperators.TextEndWith:
      return condition.a.endsWith(condition.b);
    case EdgeConditionOperators.TextEndWithCI:
      return condition.a?.toLowerCase().endsWith(condition.b?.toLowerCase());
    case EdgeConditionOperators.TextNotEndWith:
      return !condition.a.endsWith(condition.b);
    case EdgeConditionOperators.TextNotEndWithCI:
      return !condition.a?.toLowerCase().endsWith(condition.b?.toLowerCase());
    case EdgeConditionOperators.TextPattern:
      return !!condition.a?.match(new RegExp(`${condition.b}`))?.length;
    case EdgeConditionOperators.TextPatternCI:
      return !!condition.a?.match(new RegExp(`${condition.b}`, "i"))?.length;
    case EdgeConditionOperators.TextNotPattern:
      return condition.a?.match(new RegExp(`${condition.b}`)) == null;
    case EdgeConditionOperators.TextNotPatternCI:
      return condition.a?.match(new RegExp(`${condition.b}`, "i")) == null;
    case EdgeConditionOperators.NumberGreaterThan:
      return condition.a > condition.b;
    case EdgeConditionOperators.NumberLessThan:
      return condition.a < condition.b;
    case EdgeConditionOperators.NumberGreaterThanOrEqual:
      return condition.a >= condition.b;
    case EdgeConditionOperators.NumberLessThanOrEqual:
      return condition.a <= condition.b;
    case EdgeConditionOperators.DateEqual:
      return moment(`${condition.a}`).isSame(moment(`${condition.b}`));
    case EdgeConditionOperators.DateNotEqual:
      return !moment(`${condition.a}`).isSame(moment(`${condition.b}`));
    case EdgeConditionOperators.DateGreaterThan:
      return moment(`${condition.a}`).isAfter(moment(`${condition.b}`));
    case EdgeConditionOperators.DateLessThan:
      return moment(`${condition.a}`).isBefore(moment(`${condition.b}`));
    case EdgeConditionOperators.DateGreaterThanOrEqual:
      return moment(`${condition.a}`).isSameOrAfter(moment(`${condition.b}`));
    case EdgeConditionOperators.DateLessThanOrEqual:
      return moment(`${condition.a}`).isSameOrBefore(moment(`${condition.b}`));
    case EdgeConditionOperators.TimeEqual:
      return (
        moment(`${condition.a}`).format("hh:mm") ===
        moment(`${condition.b}`).format("hh:mm")
      );
    case EdgeConditionOperators.TimeNotEqual:
      return (
        moment(`${condition.a}`).format("hh:mm") !==
        moment(`${condition.b}`).format("hh:mm")
      );
    case EdgeConditionOperators.TimeGreaterThan:
      return moment(moment(`${condition.a}`).format("hh:mm"), "hh:mm").isAfter(
        moment(moment(`${condition.b}`).format("hh:mm"), "hh:mm")
      );
    case EdgeConditionOperators.TimeLessThan:
      return moment(moment(`${condition.a}`).format("hh:mm"), "hh:mm").isBefore(
        moment(moment(`${condition.b}`).format("hh:mm"), "hh:mm")
      );
    case EdgeConditionOperators.TimeGreaterThanOrEqual:
      return moment(
        moment(`${condition.a}`).format("hh:mm"),
        "hh:mm"
      ).isSameOrAfter(
        moment(moment(`${condition.b}`).format("hh:mm"), "hh:mm")
      );
    case EdgeConditionOperators.TimeLessThanOrEqual:
      return moment(
        moment(`${condition.a}`).format("hh:mm"),
        "hh:mm"
      ).isSameOrBefore(
        moment(moment(`${condition.b}`).format("hh:mm"), "hh:mm")
      );
    case EdgeConditionOperators.ArrayContains:
      return condition.a?.includes(condition.b);
    case EdgeConditionOperators.ArrayContainsCI:
      return condition.a?.includes(condition.b?.toLowerCase());
    case EdgeConditionOperators.ArrayNotContains:
      return !condition.a?.includes(condition.b);
    case EdgeConditionOperators.ArrayNotContainsCI:
      return !condition.a?.includes(condition.b?.toLowerCase());
    case EdgeConditionOperators.ArrayEquals:
      return condition.a?.length == condition.b;
    case EdgeConditionOperators.ArrayNotEquals:
      return condition.a?.length != condition.b;
    case EdgeConditionOperators.ArrayGreater:
      return condition.a?.length > condition.b;
    case EdgeConditionOperators.ArrayLess:
      return condition.a?.length < condition.b;
    case EdgeConditionOperators.ArrayGreaterOrEqual:
      return condition.a?.length >= condition.b;
    case EdgeConditionOperators.ArrayLessOrEqual:
      return condition.a?.length <= condition.b;
  }
};

export const getIncomingOperators = (
  node?: Partial<FusionOperator>,
  operators: FusionOperator[] = []
): FusionOperator[] => {
  if (!node) {
    return operators;
  }

  if (node.is_start_node) {
    return [];
  }

  const parentSlug = node.parent_operator_slug;
  if (!parentSlug) {
    return [];
  }

  const parentOperator = operators.find(
    (operator) => operator.operator_slug === parentSlug
  );
  if (!parentOperator) {
    return [];
  }

  return [parentOperator, ...getIncomingOperators(parentOperator, operators)];
};

export const createFusion = async (
  accountId: string,
  fusion: Partial<Fusion>
) => {
  const now = new Date().toISOString();

  const slug = fusion.slug ?? fusion.fusion_slug ?? v4();
  const fusionItem: Partial<Fusion> = {
    id: `${accountId}:fusions`,
    slug: slug,
    account_id: accountId,
    fusion_slug: slug,
    fusion_title: "",
    fusion_tags: [],
    fusion_operators: [],
    operator_count: 0,
    branch_count: 1,
    fusion_fields: {},
    is_active: 0,
    is_deleted: 0,
    created_at: now,
    updated_at: now,
    ...fusion,
  };

  const tableParams: DynamoDB.DocumentClient.PutItemInput = {
    TableName: envTableNames.DYNAMODB_ACCT_FUSIONS,
    Item: fusionItem,
  };

  await dynamodb.put(tableParams);

  const readParams: DynamoDB.DocumentClient.QueryInput = {
    TableName: `${envTableNames.DYNAMODB_ACCT_FOLDERS}`,
    KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
    FilterExpression: "#name = :name",
    ExpressionAttributeNames: {
      "#id": "id",
      "#slug": "slug",
      "#name": "name",
    },
    ExpressionAttributeValues: {
      ":id": `${accountId}:${FOLDERS}`,
      ":slug": "false:fusion",
      ":name": "Fusions",
    },
  };

  const { Items: folders = [] } = await dynamodb.query(readParams);

  if (folders.length) {
    const childs: Array<object> = folders[0].childs;

    childs.push({
      id: `${accountId}:fusions`,
      slug: slug,
    });

    const params: DynamoDB.DocumentClient.UpdateItemInput =
      buildUpdateExpression({
        tableName: envTableNames.DYNAMODB_ACCT_FOLDERS,
        keys: {
          id: `${accountId}:${FOLDERS}`,
          slug: folders[0].slug!,
        },
        item: {
          childs: childs,
        },
      });

    await dynamodb.update(params);
  } else {
    const folderParams: DynamoDB.DocumentClient.PutItemInput = {
      TableName: envTableNames.DYNAMODB_ACCT_FOLDERS,
      Item: {
        id: `${accountId}:${FOLDERS}`,
        slug: `false:fusion:${v4()}`,
        name: "Fusions",
        sort_order: 0,
        childs: [
          {
            id: `${accountId}:fusions`,
            slug: slug,
          },
        ],
        created_at: new Date().toISOString(),
        updated_at: null,
        is_deleted: 0,
      },
    };

    await dynamodb.put(folderParams);
  }

  return fusionItem;
};
