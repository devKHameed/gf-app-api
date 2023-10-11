// import { VM } from 'vm2';
import _ from "lodash";
import moment from "moment";
import moment_timezone from "moment-timezone";
import vm from "vm";
import { AstType } from "./enum";
import {
  ArrayExpression,
  AstStatement,
  BinaryExpression,
  CallExpression,
  ConditionalExpression,
  Expression,
  LogicalExpression,
  MemberExpression,
  ObjectExpression,
} from "./types";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

// global.gf_ = _;
// global.gf_moment_timezone = moment_timezone;
// global.gf_moment = moment;

type Data = Record<string, unknown>;
type Functions = Record<string, string>;

export const evaluateAst = (
  ast: AstStatement,
  data: Data,
  functions: Functions,
  checkFunctions = false
): unknown => {
  // console.log(ast, data, functions, checkFunctions);
  switch (ast.type) {
    case AstType.ExpressionStatement:
      return evaluateAst(ast.expression, data, functions);
    case AstType.Identifier:
      return checkFunctions ? functions[ast.name] : data[ast.name];
    case AstType.ConditionalExpression:
      return evaluateConditionalNode(ast, data, functions);
    case AstType.BinaryExpression:
      return evaluateBinaryAstNode(ast, data, functions);
    case AstType.LogicalExpression:
      return evaluateLogicalAstNode(ast, data, functions);
    case AstType.CallExpression:
      // console.log("CallExpression: ", JSON.stringify(functions));
      return evaluateCallExpression(ast, data, functions);
    case AstType.MemberExpression:
      return evaluateMemberExpression(ast, data, functions);
    case AstType.ObjectExpression:
      return evaluateObjectExpressions(ast, data, functions);
    case AstType.ArrayExpression:
      return evaluateArrayExpressions(ast, data, functions);
    case AstType.NowLiteral:
      return Date.now();
    case AstType.NumericLiteral:
    case AstType.StringLiteral:
    case AstType.BooleanLiteral:
    case AstType.NullLiteral:
      return ast.value;
    default:
      return null;
  }
};

const evaluateObjectExpressions = (
  ast: ObjectExpression,
  data: Data,
  functions: Functions
) => {
  const obj: Data = {};
  ast.properties.forEach((prop) => {
    const key = evaluateAst(prop.key, data, functions) as string | number;
    const value = evaluateAst(prop.value, data, functions);
    obj[key] = value;
  });
  return obj;
};

const evaluateArrayExpressions = (
  ast: ArrayExpression,
  data: Data,
  functions: Functions
) => {
  return ast.elements.map((element) => evaluateAst(element, data, functions));
};

const evaluateCallExpression = (
  ast: CallExpression,
  data: Data,
  functions: Functions
): unknown => {
  // console.log({ callee: ast.callee, data, functions });
  const functionDef = evaluateAst(ast.callee, data, functions, true);
  const args = ast.arguments.map((arg) => evaluateAst(arg, data, functions));
  return vm.runInNewContext(
    `const func = ${functionDef}; func(...args);`,
    {
      gf_: _,
      gf_moment: moment,
      gf_moment_timezone: moment_timezone,
      args,
      Buffer,
    },
    {
      timeout: 2 * MINUTE,
    }
  );
  // const vm = new VM({
  //   timeout: 2 * MINUTE,
  //   sandbox: {
  //     gf_: _,
  //     gf_moment: moment,
  //     gf_moment_timezone: moment_timezone,
  //     args
  //   },
  //   eval: false,
  //   wasm: false,
  //   allowAsync: false
  // });
  // return vm.run(`const func = ${functionDef}; func(...args);`);
};

const evaluateMemberExpression = (
  ast: MemberExpression,
  data: Data,
  functions: Functions
) => {
  const obj = evaluateAst(ast.object, data, functions) as Data;
  const prop = evaluateAst(
    ast.property,
    ast.property.type === AstType.Identifier ? obj : data,
    functions
  ) as string | number;
  return ast.property.type === AstType.Identifier ? prop : obj[prop];
};

const evaluateConditionalNode = (
  ast: ConditionalExpression,
  data: Data,
  functions: Functions
) => {
  const test = evaluateAst(ast.test, data, functions) as boolean;

  if (test) {
    return evaluateAst(ast.consequent, data, functions);
  } else if (ast.alternative) {
    return evaluateAst(ast.alternative, data, functions);
  } else {
    return null;
  }
};

const evaluateBinaryAstNode = (
  ast: BinaryExpression,
  data: Data,
  functions: Functions
) => {
  const operator = ast.operator;
  const left = evaluateAst(ast.left as Expression, data, functions) as any;
  const right = evaluateAst(ast.right as Expression, data, functions) as any;

  switch (operator) {
    case "==":
    case "===":
      return left === right;
    case "<":
      return left < right;
    case ">":
      return left > right;
    case "<=":
      return left <= right;
    case ">=":
      return left >= right;
    case "+":
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-plus-operands
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return left / right;
    case "%":
      return left % right;
    default:
      return null;
  }
};

const evaluateLogicalAstNode = (
  ast: LogicalExpression,
  data: Data,
  functions: Functions
) => {
  const operator = ast.operator;
  const left = evaluateAst(ast.left as Expression, data, functions);
  const right = evaluateAst(ast.right as Expression, data, functions);

  switch (operator) {
    case "&&":
      return left && right;
    case "||":
      return left || right;
    default:
      return null;
  }
};
