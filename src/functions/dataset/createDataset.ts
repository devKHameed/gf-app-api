import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import validator from "@middy/validator";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Account, AccountUser, DatasetDesign } from "types";
import { ACCOUNT_DATASET_DESIGN_TABLE_NAME, envTableNames } from "../../config";
import { FusionLambda, InvocationType } from "../../constants/3pApp";
import { DocumentElementType } from "../../constants/dataset";
import connectKnex from "../../helpers/knex/connect";
import { invokeLambda } from "../../helpers/lambda";
import getAccountData from "../../middleware/getAccountData";
import getUser from "../../middleware/getUser";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import insertValues from "../../util/dataset/insertValues";
import { getFusion } from "../../util/fusion";
import { createUniversalEvent } from "../universalEvent/createUniversalEvent";
const dynamoDb = new DynamoDB.DocumentClient();

const eventSchema = {
  type: "object",
  properties: {
    body: {
      type: "object",
      properties: {
        dataset_type_slug: {
          type: "string",
        },
        title: {
          type: "string",
        },
        fields: {
          type: "object",
          default: {},
        },
        use_fusion: {
          type: "boolean",
          default: false,
        },
        fusion_id: {
          type: "string",
        },
      },
      required: ["dataset_type_slug", "title"],
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
  const {
    dataset_type_slug,
    title,
    use_fusion,
    fusion_id,
    fields: requestField,
  } = event.body;
  const accountId: string = event.headers["account-id"] as string;
  const account = event.account as Account;
  const user = event.user as AccountUser;
  if (!user.slug) throw createError("user does not exists!");

  const params: Record<string, unknown> = {
    dataset_type_slug,
    title,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_active: 1,
    is_deleted: 0,
  };

  const datasetDesignParams: DynamoDB.DocumentClient.GetItemInput = {
    TableName: envTableNames.DYNAMODB_ACCT_DATASET_DESIGN,
    Key: {
      id: `${accountId}:${ACCOUNT_DATASET_DESIGN_TABLE_NAME}`,
      slug: dataset_type_slug,
    },
  };

  try {
    const { Item } = await dynamoDb.get(datasetDesignParams).promise();
    const datasetDesign = Item as DatasetDesign;

    if (use_fusion && fusion_id) {
      const fusion = await getFusion(fusion_id, accountId);
      // console.log({ fusion });
      await invokeLambda(
        FusionLambda.SessionInt,
        {
          fusionSlug: fusion_id,
          fusion: fusion,
          accountId: accountId,
          userId: user.slug,
          popupVariables: { popup_variables: requestField },
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        InvocationType.Event as unknown as any,
        { roundRobin: true }
      );
    } else {
      if (account.database_name && datasetDesign?.fields && requestField) {
        const connectionKnex = await connectKnex(account.database_name);

        const [id] = await insertValues({
          knex: connectionKnex,
          tableName: datasetDesign.sql_table_name,
          dynamicData: requestField,
          staticData: params,
          fields:
            (datasetDesign?.fields?.fields as {
              slug: string;
              type: `${DocumentElementType}`;
            }[]) || [],
        }).returning(["id"]);

        console.log("new added id ", id);
        params.id = id;
        await createUniversalEvent({
          recordId: id,
          recordType: "dataset_record",
          accountId: accountId,
          eventSlug: "created",
          eventData: { ...params, fields: requestField },
          userId: (event.user as AccountUser).slug,
        });
      }
    }

    return {
      statusCode: 201,
      body: { data: params },
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
