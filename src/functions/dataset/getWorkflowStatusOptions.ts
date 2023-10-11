import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import { AWSError } from "aws-sdk/lib/error";
import { default as createError } from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account, DatasetDesign } from "types";
import { Dataset } from "types/Dataset";
import { ACCOUNT_DATASET_DESIGN_TABLE_NAME, envTableNames } from "../../config";
import { DocumentElementType } from "../../constants/dataset";
import { dynamodb } from "../../helpers/db";
import connectKnex from "../../helpers/knex/connect";
import getAccountData from "../../middleware/getAccountData";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const datasetDesignSlug = event.pathParameters?.datasetDesignSlug;
  const statusFieldSlug = event.pathParameters?.statusFieldSlug;

  const accountId = event.headers["account-id"];
  const account = (event as any).account as Account;

  try {
    if (!account) {
      throw createError(401, "Unauthorized");
    }

    const datasetDesignRes = await dynamodb.get({
      TableName: envTableNames.DYNAMODB_ACCT_DATASET_DESIGN,
      Key: {
        id: `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`,
        slug: datasetDesignSlug,
      },
    });

    if (!datasetDesignRes.Item) {
      throw createError(404, "Dataset design not found");
    }

    const datasetDesign = datasetDesignRes.Item as DatasetDesign;

    if (!datasetDesign.sql_table_name) {
      throw createError(404, "SQL table name not found");
    }

    const field = datasetDesign.fields.fields.find(
      (f) => f.slug === statusFieldSlug
    );

    if (!field) {
      throw createError(404, "Field not found");
    }

    console.log(JSON.stringify(field, null, 2));

    if (field.type === DocumentElementType.Select) {
      if (field.list_source === "hardcoded") {
        return {
          statusCode: 200,
          body: {
            data: field.list_items?.map((i) => ({
              value: i.value,
              label: i.label,
            })),
          },
        };
      } else if (field.associated_document) {
        const connection = await connectKnex(account.database_name);
        const associatedDesignRes = await dynamodb.get({
          TableName: envTableNames.DYNAMODB_ACCT_DATASET_DESIGN,
          Key: {
            id: `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`,
            slug: field.associated_document,
          },
        });
        const associatedDesign = associatedDesignRes.Item as DatasetDesign;
        const associatedDatasets = await connection(
          associatedDesign.sql_table_name
        )
          .select<Dataset[]>("*")
          .limit(30);
        console.log(
          "🚀 ~ file: getWorkflowStatusOptions.ts:81 ~ constlambdaHandler:ValidatedEventAPIGatewayProxyEvent= ~ associatedDatasets:",
          associatedDatasets
        );

        return {
          statusCode: 200,
          body: {
            data: associatedDatasets?.map((d) => ({
              value: d.id,
              label:
                d[
                  (field.associated_document_label_field as keyof Dataset) ||
                    "title"
                ] ?? d.id,
            })),
          },
        };
      } else {
        throw new Error("Invalid dataset field");
      }
    }

    const connection = await connectKnex(account.database_name);

    const [res] = await connection(datasetDesign.sql_table_name)
      .select<{ statuses: string }[]>(
        connection.raw("group_concat(distinct ??) as statuses", [
          statusFieldSlug,
        ])
      )
      .limit(30);

    return {
      statusCode: 200,
      body: {
        data:
          res.statuses?.split(",").map((s) => ({ label: s, value: s })) || [],
      },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    console.log("error:-", error);
    throw createError(err?.statusCode || 500, err, { expose: true });
  }
};

export const handler = middy()
  .use(httpErrorHandler()) // handles common http errors and returns proper responses
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
  .handler(lambdaHandler);
