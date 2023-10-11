import isEmpty from "lodash/isEmpty";
import { FlowControlOperators } from "../../../constants/3pApp";
import { SYSTEM_APP, SYSTEM_APP_MODULES } from "../../../constants/fusion";
import {
  Fusion,
  FusionOperator,
  OperatorResponses,
  SessionAggregators,
  SessionData,
} from "../../../types";
import {
  SessionInitVars,
  SessionInitializerEvent,
} from "../../../types/FlowRunner";
import { getFusion } from "../../../util/fusion";

export const getFusionFromEvent = async (event: SessionInitializerEvent) => {
  if (event.fusion) {
    return event.fusion;
  }

  return getFusion(event.fusionSlug, event.accountSlug);
};

export const getSessionOperatorsFromFusion = (
  fusion: Fusion
): SessionData["session_operators"] =>
  fusion.fusion_operators?.map((operator) => ({
    ...operator,
    operator_status: "Pending",
    execution_cycle: 0,
    total_credit_count: 0,
    cycle_credit_count: 0,
  })) || [];

export const getStartOperatorFromFusionOperators = (
  operators: FusionOperator[] = []
) => operators.find((operator) => operator.is_start_node);

export const getInitialInputForSession = (
  sessionInitVars: SessionInitVars,
  fusion: Fusion,
  startOperator: FusionOperator
) => {
  const inputs: Record<string, unknown> = {
    ...sessionInitVars,
    sessionInitVars: fusion.fusion_fields?.fields?.reduce((acc, field) => {
      // TODO: validate fields

      acc[field.slug] = sessionInitVars?.[field.slug] ?? field.default_value;
      return acc;
    }, {} as Record<string, unknown>),
  };

  if (startOperator.app === SYSTEM_APP && !isEmpty(sessionInitVars)) {
    inputs[startOperator.operator_slug] = sessionInitVars;
  }

  return inputs;
};

export const getAggregatorsForSession = (operators: FusionOperator[] = []) =>
  operators
    .filter((op) => op.app_module === FlowControlOperators.ArrayAggregator)
    .reduce<SessionAggregators>((acc, op) => {
      acc[`${op.operator_slug}`] = {
        inputs: [],
        processed_items: 0,
        item_count: 0,
      };

      return acc;
    }, {}) ?? {};

export const prepareOperatorResponsesForDB = (
  operators: FusionOperator[] = []
) =>
  operators.reduce<OperatorResponses>((acc, op) => {
    acc[`${op.operator_slug}`] = { operations: [] };
    return acc;
  }, {});

export const prepareSessionLoopsDataForDB = (
  operators: FusionOperator[] = []
) =>
  operators
    .filter(
      (op) =>
        op.app_module === SYSTEM_APP_MODULES.Loop ||
        op.app_module === SYSTEM_APP_MODULES.LoopWhile
    )
    .map((op) => {
      const loopEnd = operators.find(
        (o) =>
          o.app_module === SYSTEM_APP_MODULES.LoopEnd &&
          o.operator_input_settings?.loop_slug === op.operator_slug
      )?.operator_slug as string;
      const inLoopOperators = operators.filter(
        (o) =>
          o.in_loop &&
          o.loop_data?.loop_end_slug === loopEnd &&
          o.loop_data.loop_start_slug === op.operator_slug
      );
      const branchCount =
        1 +
        inLoopOperators.filter(
          (io) =>
            !operators.find((o) => o.parent_operator_slug === io.operator_slug)
        ).length;
      return {
        loop_start_operator: op.operator_slug,
        loop_end_operator: loopEnd,
        total_iterations: 0,
        iteration_index: 0,
        loop_branch_count: branchCount,
        loop_branch_index: 0,
      };
    });
