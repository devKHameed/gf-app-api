import middy from "@middy/core";
import { Handler } from "aws-lambda";
import flowRunnerError from "../../middleware/flowRunnerError";
import mainDbInitializer from "../../middleware/mainDbInitializer";
import { SessionExecutorEvent } from "../../types/FlowRunner";
import { getSessionItem } from "../../util/3pModule";

const lambdaHandler: Handler<SessionExecutorEvent> = async (event) => {
  const { sessionSlug, accountSlug, initialInput } = event;

  if (!sessionSlug) {
    throw new Error("sessionSlug is required");
  }

  if (!accountSlug) {
    throw new Error("accountSlug is required");
  }

  const session = await getSessionItem(sessionSlug, accountSlug);
};

export const handler = middy()
  .use(mainDbInitializer())
  .use(flowRunnerError())
  .handler(lambdaHandler);
