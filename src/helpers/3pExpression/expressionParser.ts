import _ from "lodash";
import { GFMLFunction } from "types/Fusion/3pApp";
import { Parser } from "./parser";
import { evaluateAst } from "./parser/astHelper";

const parseEvaluatedValue = (value: unknown) => {
  if (_.isPlainObject(value) || _.isArray(value)) {
    return `${JSON.stringify(value)}`;
  } else if (_.isDate(value)) {
    return `${value.toISOString()}`;
  }

  return value;
};

const getFunctionScript = (func: GFMLFunction) => {
  return func.function_value ?? func.function_script;
};

const getMappedFunctions = (functions: GFMLFunction[] = []) => {
  return functions.reduce<Record<string, string>>((acc, func) => {
    try {
      // const funcDef = new Function(
      //   `const innerFunc = ${getFunctionScript(func)}; return innerFunc`
      // )();
      return { ...acc, [func.function_slug]: getFunctionScript(func) };
    } catch (e) {
      console.log(func);
      console.log("Error: ", e);
      return acc;
    }
  }, {});
};

const evaluate = (
  value: string,
  data: Record<string, unknown>,
  gfmlFunctions: Record<string, string>
) => {
  const parser = new Parser();
  // console.log("TO AST: ", { value });
  const ast = parser.parse(value);
  // console.log(JSON.stringify(ast, null, 2));

  const evaluated = evaluateAst(ast[0], data, gfmlFunctions);
  return evaluated;
};

export const parse3PExpressions = (
  value: string,
  bodyData: Record<string, unknown>,
  functions: GFMLFunction[],
  raw: boolean
): unknown => {
  // console.log(JSON.stringify({ value, bodyData }, null, 2));
  // console.log("Functions: ", JSON.stringify(functions, null, 2));
  let str = value;

  const exprs = [];
  let hasExpr = true;

  while (hasExpr) {
    const exprStartIdx = str.indexOf("{{");
    const exprEndIdx = str.indexOf("}}");

    if (exprStartIdx === -1 || exprEndIdx < exprStartIdx) {
      hasExpr = false;
      continue;
    }

    const currentExpr = str.substring(exprStartIdx + 2, exprEndIdx);
    exprs.push(currentExpr);
    str = str.replace(`{{${currentExpr}}}`, "[[[__expr__]]]");
  }

  const isOnlyExpression =
    exprs.length === 1 && str.trim() === "[[[__expr__]]]";

  let evaluatedValue: unknown;
  for (const expr of exprs) {
    evaluatedValue = undefined;
    const evalExpr = expr;

    const gfmlFunctions = getMappedFunctions(functions);
    try {
      evaluatedValue = evaluate(evalExpr, bodyData, gfmlFunctions);
      // console.log(_.isArray(evaluatedValue), _.isPlainObject(evaluatedValue));
      // console.log(
      //   "🚀 ~ file: expressionParser.ts:86 ~ evaluatedValue:",
      //   evaluatedValue
      // );
      if (!raw) {
        evaluatedValue = parseEvaluatedValue(evaluatedValue);
      }
      // console.log(
      //   "🚀 ~ file: expressionParser.ts:88 ~ evaluatedValue:",
      //   evaluatedValue
      // );
    } catch (e) {
      console.log(`could not evaluate: ${expr}`, e);
      evaluatedValue = `{{${expr}}}`;
    }
    str = str.replace(
      "[[[__expr__]]]",
      evaluatedValue === undefined ? "" : `${evaluatedValue}`
    );
  }

  try {
    if (exprs.length === 1) {
      // console.log("expr 1");
      if (`${evaluatedValue}` === str) {
        // console.log("equal");
        // console.log("returning direct: ", evaluatedValue);
        return evaluatedValue;
      } else {
        // console.log("not equal");
        // console.log("returning: evaluatedValue: ", evaluatedValue);
        return isOnlyExpression ? evaluatedValue : str;
      }
    } else {
      // console.log("expr more");
      // console.log("returning: str: ", str);
      return str;
    }
  } catch (e) {
    console.log(`could not parse: ${str}`, e);
    return str;
  }
};
