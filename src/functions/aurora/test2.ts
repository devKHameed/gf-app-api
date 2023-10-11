import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import responseSerializer from "@middy/http-response-serializer";
import { envTableNames } from "../../config";
import { getAuroraConnection } from "../../helpers/db/aurora";
import type { ValidatedEventAPIGatewayProxyEvent } from "../../lib/apiGateway";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";
import mainDbInitializer from "../../middleware/mainDbInitializer";
import getAccount from "../../util/getAccount";

const fromTable = envTableNames.DYNAMODB_ACCT_FUSIONS;
const toTable = "acct_ffusions-dev";

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  console.log(
    "🚀 ~ file: test2.ts:15 ~ constlambdaHandler:ValidatedEventAPIGatewayProxyEvent= ~ event:",
    event
  );

  // await dynamodb.put({
  //   TableName: "acct_ffusions-dev",
  //   Item: {
  //     id: "session-slug-1",
  //     slug: Date.now().toString(),
  //     operator_id: "op-4",
  //     inputs: { a: "c", b: "d" },
  //     responses: {},
  //   },
  // });

  // await dynamodb.put({
  //   TableName: "acct_ffusions-dev",
  //   Item: {
  //     id: "session-slug-1",
  //     slug: Date.now().toString(),
  //     operator_id: "op-3",
  //     inputs: { a: "a", b: "b" },
  //     responses: {},
  //   },
  // });

  // const { Items } = await dynamodb.query({
  //   TableName: "acct_ffusions-dev",
  //   KeyConditionExpression: "#id = :id",
  //   ExpressionAttributeNames: {
  //     "#id": "id",
  //   },
  //   ExpressionAttributeValues: {
  //     ":id": "session-slug-1",
  //   },
  //   ScanIndexForward: false,
  //   Limit: 1,
  // });

  // const { Items = [] } = await dynamodb.scan({
  //   TableName: fromTable,
  // });

  // for (const item of Items) {
  //   // await dynamodb.put({
  //   //   TableName: toTable,
  //   //   Item: {
  //   //     ...item,
  //   //     fusion_type: item.fusion_type || "core",
  //   //     is_deleted: item.is_deleted ? 1 : 0,
  //   //     is_active: item.is_active ? 1 : 0,
  //   //   },
  //   // });
  //   await dynamodb.update({
  //     TableName: fromTable,
  //     Key: {
  //       id: item.id,
  //       slug: item.slug,
  //     },
  //     UpdateExpression: "SET is_active = :is_active",
  //     ExpressionAttributeValues: {
  //       ":is_active": 0,
  //     },
  //   });
  // }

  // const s3 = await getS3Client();
  // const url = s3.getSignedUrl("getObject", {
  //   Bucket: "guifusion-dev-media-bucket",
  //   Key: "global/uploads/4e71242b-dae3-4807-8062-59bb8a1c7350_medium-2e5c1add-1dba-4dc0-8131-97b1fafae803.jpg",
  //   Expires: 120,
  // });

  try {
    const account = await getAccount("master-account");

    console.log(account?.database_name);

    // const query = (event as any).body?.query as string;
    // console.log(
    //   "🚀 ~ file: test2.ts:55 ~ constlambdaHandler:ValidatedEventAPIGatewayProxyEvent= ~ query:",
    //   query
    // );

    // if (account?.database_name && query) {
    // const knex = await connectKnex(account.database_name);

    // const res = await knex
    //   .select()
    //   .from("t_0de9ebb8e7feb4f869d2fb783c00b5bf9");

    const connection = await getAuroraConnection(account?.database_name || "");
    // const res = await connection.execute(
    // `
    //   SELECT * FROM t_09bc476c955a54fad8a4bbd5180f40e7d;
    // `
    // `
    //   SELECT TABLE_NAME AS table_name, GROUP_CONCAT(COLUMN_NAME) AS column_names FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '${account.database_name}' GROUP BY TABLE_NAME
    // `
    //   query
    // );
    return {
      statusCode: 200,
      body: { data: {} },
    };
    // }

    // return {
    //   statusCode: 200,
    //   body: { data: [] },
    // };
  } catch (err) {
    console.log(err);
    return {
      statusCode: 200,
      body: { error: err },
    };
  }
};

export const handler = middy()
  .use(jsonBodyParser())
  .use(mainDbInitializer())
  // .use(getAccountData())
  .use(httpErrorHandler())
  .use(jsonschemaErrors())
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
