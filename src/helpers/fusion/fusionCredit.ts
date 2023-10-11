import { Knex } from "knex";
import { isEmpty } from "lodash";
import { AccountCredit, FusionSession } from "types";
import { ACCOUNT_CREDIT } from "../../config";
import {
  CREDIT_CHECK_TRIGGER,
  FUSION_CREDIT_TYPE_ID,
} from "../../constants/fusion";
import connectKnex from "../../helpers/knex/connect";
import { updateSession } from "../../util/3pModule";

class CreditsExceedError extends Error {
  constructor() {
    super("Credits exceed");
    this.name = "CreditsExceedError";
    this.stack = new Error().stack;
  }
}

export const getAvailableCredits = async (connection: Knex) => {
  const [data] = await connection<AccountCredit>(ACCOUNT_CREDIT)
    .select(["credit_type_id", "credits_available"])
    .where("credit_type_id", "=", FUSION_CREDIT_TYPE_ID)
    .limit(1);

  if (!data) {
    return null;
  }

  return data.credits_available;
};

export const getCreditCheckTrigger = async () => {
  return Promise.resolve(CREDIT_CHECK_TRIGGER);
};

export const performCreditCheck = async (
  accountSlug: string,
  sessionSlug: string,
  sqlDbName: string,
  operatorIdx: number,
  operatorCredits: number
) => {
  console.log("performCreditCheck", {
    accountSlug,
    sessionSlug,
    sqlDbName,
    operatorIdx,
    operatorCredits,
  });
  const creditCheckTrigger = await getCreditCheckTrigger();
  console.log(
    "🚀 ~ file: fusionCredit.ts:43 ~ creditCheckTrigger:",
    creditCheckTrigger
  );
  const { Attributes = {} } = await updateSession(
    accountSlug,
    sessionSlug,
    `SET #sessionData.#sessionOperators[${operatorIdx}].#cycleCreditCount = #sessionData.#sessionOperators[${operatorIdx}].#cycleCreditCount + :inc, #sessionData.#sessionOperators[${operatorIdx}].#totalCreditCount = #sessionData.#sessionOperators[${operatorIdx}].#totalCreditCount + :operatorCredits, #sessionData.#totalCreditsUsed = #sessionData.#totalCreditsUsed + :inc`,
    {
      ":inc": 1,
      ":operatorCredits": operatorCredits,
    },
    {
      "#sessionData": "session_data",
      "#sessionOperators": "session_operators",
      "#cycleCreditCount": "cycle_credit_count",
      "#totalCreditCount": "total_credit_count",
      "#totalCreditsUsed": "total_credits_used",
    }
  );

  const session = Attributes as FusionSession;
  console.log(
    "🚀 ~ file: fusionCredit.ts:71 ~ session:",
    JSON.stringify(session, null, 2)
  );

  if (isEmpty(session)) {
    throw new Error("session not found");
  }

  const { cycle_credit_count } =
    session.session_data.session_operators[operatorIdx];
  console.log(
    "🚀 ~ file: fusionCredit.ts:78 ~ cycle_credit_count:",
    cycle_credit_count
  );

  if (cycle_credit_count >= creditCheckTrigger) {
    const connection = await connectKnex(sqlDbName);
    console.log(
      "updating credit in progress",
      cycle_credit_count * operatorCredits,
      FUSION_CREDIT_TYPE_ID
    );
    await connection<AccountCredit>(ACCOUNT_CREDIT)
      .increment("credits_in_progress", cycle_credit_count * operatorCredits)
      .where("credit_type_id", "=", FUSION_CREDIT_TYPE_ID);

    const accountCredit = await connection<AccountCredit>(ACCOUNT_CREDIT)
      .select("*")
      .where("credit_type_id", "=", FUSION_CREDIT_TYPE_ID)
      .first();

    if (!accountCredit) {
      throw new Error("account credit not found");
    }

    console.log("updated credit in progress", accountCredit);

    if (accountCredit.credits_in_progress > accountCredit.credits_available) {
      throw new CreditsExceedError();
    } else {
      console.log("updating credits_available, cycle_credit_count = 0");
      await updateSession(
        accountSlug,
        sessionSlug,
        `SET #sessionData.#sessionOperators[${operatorIdx}].#cycleCreditCount = :value, #sessionData.#availableCredits = :availableCredits`,
        {
          ":value": 0,
          ":availableCredits": accountCredit.credits_available,
        },
        {
          "#sessionData": "session_data",
          "#sessionOperators": "session_operators",
          "#cycleCreditCount": "cycle_credit_count",
          "#availableCredits": "credits_available",
        }
      );
      console.log("updated credits_available, cycle_credit_count = 0");
    }
  }
};
