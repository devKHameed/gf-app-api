import { AstType } from "./enum";
import { NextToken } from "./tokenizer";

export type BlockStatement = {
  type: AstType.BlockStatement;
  body: Statement[];
};

export type ArrayExpression = {
  type: AstType.ArrayExpression;
  elements: Expression[];
};

export type Identifier = {
  type: AstType.Identifier;
  name: string;
};

export type Property = {
  type: AstType.Property;
  key: Identifier;
  value: Expression;
};

export type ObjectExpression = {
  type: AstType.ObjectExpression;
  properties: Property[];
};

export type LogicalExpression<
  T extends LogicalANDExpression | EqualityExpression | unknown = unknown
> = {
  type: AstType.LogicalExpression;
  operator: string;
  left: T;
  right: T;
};

export type LogicalANDExpression =
  | EqualityExpression
  | LogicalExpression<EqualityExpression>;
export type LogicalORExpression =
  | LogicalANDExpression
  | LogicalExpression<LogicalANDExpression>;

export type NumericLiteral = {
  type: AstType.NumericLiteral;
  value: number;
};

export type StringLiteral = {
  type: AstType.StringLiteral;
  value: string;
};

export type BooleanLiteral = {
  type: AstType.BooleanLiteral;
  value: boolean;
};

export type NullLiteral = {
  type: AstType.NullLiteral;
  value: null;
};

export type NowLiteral = {
  type: AstType.NowLiteral;
  value: "now";
};

export type Literal =
  | NumericLiteral
  | StringLiteral
  | BooleanLiteral
  | NullLiteral
  | NowLiteral;

export type ParenthesizedExpression = Expression;

export type PrimaryExpression =
  | Literal
  | ParenthesizedExpression
  | Identifier
  | CallMemberExpression;

export type MemberExpression = {
  type: AstType.MemberExpression;
  object: MemberExpression | PrimaryExpression;
} & (
  | {
      computed: true;
      property: Expression | Literal;
    }
  | {
      computed: false;
      property: Identifier;
    }
);

export type Argument = Expression;

export type CallExpression = {
  type: AstType.CallExpression;
  callee: MemberExpression | CallExpression;
  arguments: Argument[];
};

export type CallMemberExpression = MemberExpression | CallExpression;

export type UnaryExpression = {
  type: AstType.UnaryExpression;
  operator: string;
  argument: UnaryExpression | CallMemberExpression;
};

export type BinaryExpression<
  E extends
    | UnaryExpression
    | MultiplicativeExpression
    | AdditiveExpression
    | RelationalExpression
    | CallExpression
    | MemberExpression
    | unknown = unknown
> = {
  type: AstType.BinaryExpression;
  operator: string;
  left: E;
  right: E;
};

export type MultiplicativeExpression =
  | UnaryExpression
  | BinaryExpression<UnaryExpression>;
export type AdditiveExpression =
  | MultiplicativeExpression
  | BinaryExpression<MultiplicativeExpression>;
export type RelationalExpression =
  | AdditiveExpression
  | BinaryExpression<AdditiveExpression>;
export type EqualityExpression =
  | RelationalExpression
  | BinaryExpression<RelationalExpression>;

export type ConditionalExpression = {
  type: AstType.ConditionalExpression;
  test: LogicalExpression;
  consequent: Statement;
  alternative: Statement | null;
};

export type AssignmentExpression = {
  type: AstType.AssignmentExpression;
  operator: NextToken;
  left: Identifier | MemberExpression;
  right: Expression;
};

export type Expression =
  | AssignmentExpression
  | ArrayExpression
  | ObjectExpression
  | ConditionalExpression
  | LogicalExpression
  | BinaryExpression
  | CallMemberExpression;

export type ExpressionStatement = {
  type: AstType.ExpressionStatement;
  expression: Expression;
};

export type Statement = BlockStatement | ExpressionStatement;
export type Program = Statement[];
export type AstStatement = Statement | Expression | Literal | Identifier;
export type LiteralValue = string | number | boolean | null;
