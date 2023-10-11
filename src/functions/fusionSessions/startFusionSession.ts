import middy from "@middy/core";
import httpErrorHandler from "@middy/http-error-handler";
import jsonBodyParser from "@middy/http-json-body-parser";
import httpResponseSerializer from "@middy/http-response-serializer";
import DynamoDB from "aws-sdk/clients/dynamodb";
import { ValidatedEventAPIGatewayProxyEvent } from "lib/apiGateway";
import { Fusion } from "types/Fusion";
import { envTableNames } from "../../config";
import { FusionLambda } from "../../constants/3pApp";
import { FlowRunnerLambda } from "../../constants/fusion";
import { InvocationType } from "../../enums/lambda";
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

const tableName = `${envTableNames.DYNAMODB_ACCT_FUSION_SESSION_V2}`;

export const lambdaHandler: ValidatedEventAPIGatewayProxyEvent<
  typeof eventSchema
> = async (event) => {
  const accountId = event.headers["account-id"];
  const { userSlug: userId, fusion, isResponse, version } = event.body;
  const { fusion_slug, slug, session_init_vars, account_id } = fusion as Fusion;

  if (version === "v2") {
    const fusionResponse = await invokeLambda(
      FlowRunnerLambda.SessionInitializer,
      {
        sessionInitVars: session_init_vars,
        userSlug: userId,
        fusion,
        accountSlug: account_id,
      },
      InvocationType.RequestResponse,
      { roundRobin: true }
    );

    return {
      statusCode: 200,
      body: { sessionSlug: fusionResponse.Payload as string },
    };
  } else {
    const fusionResponse = await invokeLambda(
      FusionLambda.SessionInt,
      {
        fusionSlug: slug ?? fusion_slug,
        sessionInitVars: session_init_vars,
        userId,
        fusion,
        accountId: account_id,
      },
      InvocationType.RequestResponse,
      { roundRobin: true }
    );

    if (isResponse && fusionResponse) {
      console.log("Payload: ", JSON.stringify(fusionResponse, null, 2));
      const sessionSlug: string = JSON.parse(fusionResponse.Payload as string);
      console.log("This should be the session slug", sessionSlug);
      const finalPayload = await getPayload(sessionSlug, `${accountId}`);
      return {
        statusCode: 200,
        body: { message: "FusionSuccessful", data: finalPayload },
      };
    }

    return {
      statusCode: 200,
      body: { sessionSlug: fusionResponse.Payload as string },
    };
  }
};

const getPayload = async (sessionSlug: string, accountId: string) => {
  let complete = false;
  while (!complete) {
    const { Item: session } = await dynamodb
      .get({
        TableName: tableName,
        Key: { id: `${accountId}:fusion_sessions`, slug: sessionSlug },
      })
      .promise();
    if (session?.final_payload) {
      complete = true;
      return session.final_payload as unknown;
    }
  }
};

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
