import middy from "@middy/core";
import { Handler } from "aws-lambda";
// import { v4 } from "uuid";
// import {
//   envTableNames
// } from "../../config";
// import { FlowRunnerLambda } from "../../constants/fusion";
// import { InvocationType } from "../../enums/lambda";
// import { dynamodb } from "../../helpers/db";
// import { getFusionSessionKey } from "../../helpers/db/keys";
// import { getAggregatorsForSession, getFusionFromEvent, getInitialInputForSession, getSessionOperatorsFromFusion, getStartOperatorFromFusionOperators, prepareOperatorResponsesForDB, prepareSessionLoopsDataForDB } from "../../helpers/flowRunner/sessionInit";
// import { getAvailableCredits } from "../../helpers/fusion/fusionCredit";
// import connectKnex from "../../helpers/knex/connect";
// import { invokeLambda } from "../../helpers/lambda";
import flowRunnerError from "../../middleware/flowRunnerError";
import mainDbInitializer from "../../middleware/mainDbInitializer";
// import { SessionData } from "../../types";
import { SessionInitializerEvent } from "../../types/FlowRunner";
// import { getAccountItem, sendFusionNotification } from "../../util/3pModule";

// const tableName = envTableNames.DYNAMODB_ACCT_FUSION_SESSION_V2;

// const lambdaHandler: Handler<SessionInitializerEvent> = async (event) => {
const lambdaHandler: Handler<SessionInitializerEvent> = () => {
  throw new Error("Not implemented yet");
  // TODO: Implement
  // const { accountSlug, userSlug } = event;

  // if (!accountSlug || !userSlug) {
  //   throw new Error("accountSlug and userSlug are required");
  // }

  // const fusion = await getFusionFromEvent(event);

  // if (!fusion) {
  //   throw new Error("Fusion not found");
  // }

  // const sessionOperators = getSessionOperatorsFromFusion(fusion);
  // const startOperator = getStartOperatorFromFusionOperators(fusion.fusion_operators);

  // if (!startOperator) {
  //   throw new Error("Start operator not found");
  // }

  // const { import_chunk, chunk_index, skill_session_variables = {}, skill_user_variables = {}, ...sessionInitVars } = event.sessionInitVars ?? {};

  // const aggregators = getAggregatorsForSession(fusion.fusion_operators);

  // const account = await getAccountItem(accountSlug);

  // if (!account) {
  //   throw new Error("Account not found");
  // }

  // if (!account.database_name) {
  //   throw new Error(`Database not found for account ${account.slug}`);
  // }

  // const connection = await connectKnex(account.database_name);
  // const availableCredits = await getAvailableCredits(connection);

  // const operatorResponses = prepareOperatorResponsesForDB(fusion.fusion_operators);

  // const loops = prepareSessionLoopsDataForDB(fusion.fusion_operators);

  // const sessionData: SessionData = {
  //   import_chunk,
  //   chunk_index,
  //   fusion_type: fusion.fusion_type,
  //   session_status: "Building",
  //   session_init_vars: sessionInitVars,
  //   account_id: accountSlug,
  //   account_slug: accountSlug,
  //   user_id: userSlug,
  //   session_variables: {},
  //   session_operators: sessionOperators,
  //   iterators: {},
  //   operator_responses: operatorResponses,
  //   aggregators,
  //   loops,
  //   aurora_db_name: account.database_name,
  //   skill_session_variables,
  //   skill_user_variables,
  //   error_logs: [],
  //   start_time: new Date().toISOString(),
  //   skill_responses: {},
  //   credits_available: availableCredits ?? 0,
  //   total_credits_used: 0,
  //   account_package_id: account.account_package_id,
  //   parallel_branch_execution: fusion.parallel_branch_execution,
  //   branch_count: fusion.branch_count,
  //   operator_count: fusion.operator_count
  // };

  // const sessionSlug = `${fusion.slug}:${v4()}`;

  // const tableParams = {
  //   TableName: tableName,
  //   Item: {
  //     id: getFusionSessionKey(accountSlug),
  //     slug: sessionSlug,
  //     fusion_slug: fusion.slug,
  //     session_data: sessionData,
  //     is_paused: false,
  //     is_deleted: false,
  //     account_id: accountSlug,
  //     created_at: new Date().toISOString(),
  //     updated_at: new Date().toISOString(),
  //   },
  // };

  // await dynamodb.put(tableParams);

  // await sendFusionNotification(tableParams.Item);

  // const initialInput = getInitialInputForSession(sessionInitVars, fusion, startOperator);

  // await invokeLambda(FlowRunnerLambda.SessionExecutor, { sessionSlug, accountSlug, initialInput }, InvocationType.Event);

  // return sessionSlug;
};

export const handler = middy()
  .use(mainDbInitializer())
  .use(flowRunnerError())
  .handler(lambdaHandler);
