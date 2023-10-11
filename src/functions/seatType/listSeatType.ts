import middy from "@middy/core";
// import some middlewares
import httpErrorHandler from "@middy/http-error-handler";
import responseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk/lib/error";
import createError from "http-errors";
import type { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { PackageSeatSetting, SeatTypes } from "types/Account";
import { PACKAGES_SEAT_SETTING, SEAT_TYPES, envTableNames } from "../../config";
import jsonschemaErrors from "../../middleware/jsonschemaErrors";

const dynamoDb = new DynamoDB.DocumentClient();

const lambdaHandler: ValidatedEventAPIGatewayProxyEvent = async (event) => {
  const packageSlug = event.queryStringParameters?.package_slug;

  const params: DynamoDB.DocumentClient.QueryInput = {
    TableName: envTableNames.DYNAMODB_PACKAGES_SEAT_SETTING,
    KeyConditionExpression: "#id = :id",
    FilterExpression: "#is_deleted = :is_deleted",
    ExpressionAttributeNames: {
      "#id": "id",
      "#is_deleted": "is_deleted",
      "#slug": "slug",
    },
    ExpressionAttributeValues: {
      ":id": PACKAGES_SEAT_SETTING,
      ":is_deleted": 0,
      ":slug": packageSlug,
    },
  };

  if (packageSlug)
    params.KeyConditionExpression = `${params.KeyConditionExpression} AND begins_with(#slug, :slug)`;

  try {
    // fetch data from the database
    const { Items } = await dynamoDb.query(params).promise();
    let seatTypes = Items as PackageSeatSetting[];
    if (Items?.length) {
      const seatTypesMetadata = await dynamoDb
        .batchGet({
          RequestItems: {
            [envTableNames.DYNAMODB_SEAT_TYPES]: {
              Keys: seatTypes.map((item) => {
                return { id: SEAT_TYPES, slug: item.seat_id };
              }),
            },
          },
        })
        .promise()
        .then((res) => {
          // console.log("res", res);
          return res?.Responses?.[
            envTableNames.DYNAMODB_SEAT_TYPES
          ] as SeatTypes[];
        });
      seatTypes = seatTypes.map((item) => {
        const defaultValues = seatTypesMetadata?.find(
          (seat) => seat.slug === item.seat_id
        );
        return { ...defaultValues, ...item };
      });
    }
    return {
      statusCode: 200,
      body: { message: "List of package seats", data: seatTypes },
    };
  } catch (error: unknown) {
    const err: AWSError = error as AWSError;
    throw createError(err.statusCode!, err, { expose: true });
  }
};

export const handler = middy()
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
  ) // handles common http errors and returns proper responses
  .handler(lambdaHandler);
