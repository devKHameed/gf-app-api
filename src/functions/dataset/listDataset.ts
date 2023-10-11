import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import qs from "qs";
import { Account, DataField, DatasetDesign, GFGui } from "types";
import { Dataset } from "types/Dataset";
import { ACCOUNT_DATASET_DESIGN_TABLE_NAME, envTableNames } from "../../config";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = envTableNames.DYNAMODB_ACCT_DATASET_DESIGN;

const resKeys = [
  "id",
  "title",
  "dataset_type_slug",
  "is_active",
  "is_deleted",
  "updated_at",
  "created_at",
];

interface ConditionSet {
  a: string;
  b: string;
  o: string;
}

interface Condition {
  condition_set: ConditionSet[];
}

interface Filter {
  conditions: Condition[];
}

interface Query {
  dataset_type_slug: string;
  filter: Filter;
  limit: string;
  condition_filter_value: any
}
const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  console.log("----------start----------");
  const account = (event as any).account as Account;
  const databaseName = account.database_name;
  const accountId: string = event.headers["account-id"] as string;
  const datasetDesignSlug = event.pathParameters!.datasetDesignSlug;
  const title = event.queryStringParameters?.title;
  const guiSlug = event.queryStringParameters?.gui_slug;
  const fieldName = event.queryStringParameters?.field_name;
  const fieldValue = event.queryStringParameters?.field_value;
  const includedFields = event.queryStringParameters?.included_fields;
  const tabIndex = event.queryStringParameters?.tab_index;

  const parsedQuery = qs.parse(
    event.queryStringParameters as unknown as string
  ) as unknown as Query;

  console.log("----", {
    parsedQuery: parsedQuery,
    query: event.queryStringParameters,
  });

  const filter = parsedQuery?.filter;
  const conditionFilterValues = parsedQuery?.condition_filter_value;

  const limit = event.queryStringParameters?.limit
    ? parseInt(event.queryStringParameters?.limit)
    : 0;
  const offset = event.queryStringParameters?.offset
    ? parseInt(event.queryStringParameters?.offset)
    : 0;

  const datasetDesignParams: DynamoDB.DocumentClient.GetItemInput = {
    TableName: TABLE_NAME,
    Key: {
      id: `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`,
      slug: datasetDesignSlug,
    },
  };

  try {
    const { Item } = await dynamoDb.get(datasetDesignParams).promise();
    const datasetDesign = Item as DatasetDesign;

    const params: DynamoDB.DocumentClient.GetItemInput = {
      TableName: envTableNames.DYNAMODB_ACCT_GF_GUIS,
      Key: {
        id: `${accountId}`,
        slug: guiSlug,
      },
    };

    const guiRes = guiSlug ? await dynamoDb.get(params).promise() : undefined;

    const gui = guiRes?.Item as GFGui;
    console.log("gui", gui);
    const guiTab = gui?.tabs?.[Number(tabIndex)];

    if (databaseName && datasetDesign?.sql_table_name) {
      const connectionKnex = await connectKnex(account.database_name);

      let selectedFields = resKeys;
      if (includedFields && includedFields !== "all") {
        selectedFields = selectedFields.concat(includedFields.split(","));
      }
      let query = connectionKnex<Dataset>(datasetDesign.sql_table_name)
        .where((builder) => {
          void builder.where("is_deleted", 0);
          if (title?.length) {
            void builder.andWhere(function () {
              void this.orWhere("title", "like", `%${title}%`);
              const includedFieldIds =
                guiTab?.tab_type === "record_list"
                  ? guiTab?.search_fields || []
                  : [];
              if (includedFieldIds && datasetDesign.fields?.fields) {
                const includedFields: DataField[] = [];
                datasetDesign.fields?.fields?.forEach((field) => {
                  if (includedFieldIds.includes(field.id))
                    includedFields.push(field);
                });
                includedFields.map((field) => {
                  void this.orWhere(field.slug, title);
                });
              }
            });
          }
          if (guiTab) {
            const filters =
              guiTab?.tab_type === "record_list"
                ? gui.filter_settings?.view_filters?.[guiTab?.id] || []
                : [];
            console.log("filters", filters);
            if (filters.length > 0) {
              void builder.andWhere(function () {
                filters.forEach((conditionGroup) => {
                  // Create an inner query builder for each condition group (AND condition)

                  void this.orWhere(function () {
                    conditionGroup.condition_set.forEach((condition) => {
                      if (condition.a && condition.o && condition.b) {
                        if (typeof condition?.b === "string" && condition.b?.startsWith("param:")) {
                          const paramKey = condition.b.replace("param:", "");
                          if (conditionFilterValues?.[paramKey]) {// no required then skip;
                          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                            void this.andWhere(condition.a, condition.o, conditionFilterValues[paramKey]);
                          }
                        } else {
                          void this.andWhere(condition.a, condition.o, condition.b);
                        }
                      }
                    });
                  });
                });
              });
            }
          }

          // handle query filters based conditions
          if (filter?.conditions?.length) {
            void builder.andWhere(function () {
              const filters = filter.conditions;
              filters.forEach((conditionGroup) => {
                // Create an inner query builder for each condition group (AND condition)

                void this.orWhere(function () {
                  conditionGroup?.condition_set?.forEach((condition) => {
                    if (condition?.a && condition?.o && condition?.b) {
                      void this.andWhere(condition.a, condition.o, condition.b);
                    }
                  });
                });
              });
            });
          }

          // Handle Refrence type field
          let fieldMetadata: DataField | undefined;
          if (datasetDesign?.fields?.fields?.length > 0 && fieldName) {
            fieldMetadata = datasetDesign.fields.fields.find(
              (f) => f.slug === fieldName
            );
          }

          if (
            fieldValue &&
            fieldMetadata &&
            fieldMetadata?.type === "select" &&
            fieldMetadata?.list_default_display_type === "multi_drop_down"
          ) {
            void builder.andWhere(
              connectionKnex.raw(
                `JSON_CONTAINS(${fieldName},JSON_OBJECT('value', ${fieldValue}))`
              )
            );
          } else if (fieldName && fieldValue) {
            void builder.andWhere(fieldName, fieldValue);
          }
        })
        .select(includedFields === "all" ? "*" : selectedFields)
        .orderBy("id", "desc");

      if (limit) {
        query = query.limit(limit);
      }

      if (offset) {
        query = query.offset(offset);
      }
      const { sql, bindings } = query.toSQL();
      console.log(sql, bindings);

      const datasets = (await query) as unknown as Dataset[];

      console.log("----------end----------");
      return {
        statusCode: 200,
        body: {
          message: "List of datasets",
          data: datasets,
        },
      };
    }

    return {
      statusCode: 200,
      body: { message: "List of datasets", data: [] },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
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
