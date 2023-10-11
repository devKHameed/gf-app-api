import middy from "@middy/core";
import { Handler } from "aws-lambda";
import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "../../config";
import { ModuleType } from "../../enums/3pApp";
import {
  getFunctions,
  parseExpression,
  ParseOptions,
} from "../../helpers/3pExpression";
import { parseTagsToExpression } from "../../helpers/3pExpression/tagsParser";
import {
  addOperatorOperations,
  finalizeOperator,
  getPrevOperatorResponses,
} from "../../helpers/fusion";
import mainDbInitializer from "../../middleware/mainDbInitializer";
import { FusionLambdaEvent, FusionOperatorLog } from "../../types/Fusion";
import {
  generateLog,
  getAccountItem,
  getSessionItem,
  updateOperatorLogs,
  updateSessionOperatorStatus,
} from "../../util/3pModule";
import { applyToValues } from "../../util/index";

const stripe = new Stripe(`${STRIPE_SECRET_KEY}`, {
  apiVersion: "2022-08-01",
});

export const processStripeOperatorHandler: Handler<FusionLambdaEvent> = async (
  event
) => {
  // console.time("process-stripe-time");
  // console.log("Process Stripe lambda hit: ", JSON.stringify(event, null, 2));

  await processStripeOperator(event);

  // console.timeEnd("process-stripe-time");
};

export const processStripeOperator = async (event: FusionLambdaEvent) => {
  const {
    sessionSlug,
    appSlug,
    appModuleSlug,
    accountId,
    queueItem,
    responses: s3Responses,
  } = event;

  const operatorLogs: FusionOperatorLog[] = [];

  //Get The Session Data
  // console.log("Get Session Data");
  const session = await getSessionItem(sessionSlug, accountId);
  // console.log("Session Data: ", session);
  const { session_data } = session || {};

  const { session_operators } = session_data || {};
  const operatorIdx = session_operators.findIndex(
    (operator) => operator.operator_slug === queueItem.operator_id
  );
  // console.log("Operator Index: ", operatorIdx);
  const operator = session_operators[operatorIdx];
  // console.log("Operator: ", operator);

  operatorLogs.push(
    generateLog("Operator initiated", "Success", {
      sessionSlug,
      operatorSlug: queueItem.operator_id,
      appSlug,
      appModuleSlug,
    })
  );

  if (!operator) {
    return;
  }

  // console.log(
  //   "operator.operator_input_settings:",
  //   operator.operator_input_settings
  // );

  // Consume Credit
  // console.log("Consume Credit");
  // await consumeCredits(accountId, operator.total_credit);

  //SET STATUS AS PROCESSING
  // console.log("Set Status as Processing");
  await updateSessionOperatorStatus(
    sessionSlug,
    "Processing",
    operatorIdx,
    accountId
  );

  const operationIdx = await addOperatorOperations(
    accountId,
    sessionSlug,
    operator.operator_slug!
  );

  const responses = await getPrevOperatorResponses(
    queueItem.inputs,
    s3Responses
  );

  const gfmlFunctions = await getFunctions(appSlug, accountId);
  const bodyData: ParseOptions["body"] = {};
  const options: ParseOptions = {
    body: bodyData,
    responses: responses,
    functions: gfmlFunctions,
  };
  // console.log(options);

  const inputExpressions = applyToValues(
    queueItem.inputs,
    parseTagsToExpression
  );
  // console.log(
  //   "🚀 ~ file: processStripeOperator.ts:122 ~ processStripeOperator ~ inputExpressions:",
  //   JSON.stringify(inputExpressions, null, 2)
  // );
  const parameters = await parseExpression<{
    amount: number;
    charge_account_slug: string;
  }>(inputExpressions, options);
  // console.log(
  //   "🚀 ~ file: processStripeOperator.ts:124 ~ processStripeOperator ~ parameters:",
  //   JSON.stringify(parameters, null, 2)
  // );

  operatorLogs.push(
    generateLog(`Operation ${(operationIdx || 0) + 1} Started`, "Success")
  );

  const { amount, charge_account_slug: chargeAccountSlug } = parameters;

  let paymentSuccess: string | boolean = false;
  if (amount !== 0) {
    //Make Payment
    const account = await getAccountItem(chargeAccountSlug);
    if (account?.stripe_sources) {
      // console.log("Account Item: ", account.stripe_sources);
      for (const card of account.stripe_sources) {
        const stripeResponse = await makeStripePayment(
          amount,
          card.id as string,
          account.stripe_customer.id as string
        );
        // console.log("Payment Made: ", stripeResponse);
        if (stripeResponse.paid) {
          paymentSuccess = true;
        }
      }
    }
  } else {
    paymentSuccess = "Payment amount was $0";
  }

  operatorLogs.push(
    generateLog("Stripe Operator", "Success", { data: paymentSuccess })
  );

  await updateOperatorLogs(
    sessionSlug,
    operatorIdx,
    "Complete",
    operatorLogs,
    accountId
  );

  await finalizeOperator({
    accountId,
    sessionSlug,
    operator,
    operationIdx,
    appSlug,
    inputs: parameters,
    outputs: { data: paymentSuccess },
    moduleType: ModuleType.Action,
    sessionData: session.session_data,
    queueItem,
    responses: s3Responses,
    operatorLogs,
    prevOperatorResponses: responses,
    operatorIdx,
  });
};

export const makeStripePayment = async (
  amount: number,
  id: string,
  customerId: string
) => {
  const param = {
    amount: Math.round(Number(amount.toFixed(2)) * 100),
    currency: "usd",
    source: id,
    customer: customerId,
    description: "Stripe Operator",
  };
  // console.log(param);
  const charge = await stripe.charges.create(param);
  return charge;
};

export const handler = middy()
  .use(mainDbInitializer())
  .handler(processStripeOperatorHandler);
