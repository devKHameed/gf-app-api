export enum Token {
  SimpleAssign = "SIMPLE_ASSIGN",
  Identifier = "IDENTIFIER",
  ComplexAssign = "COMPLEX_ASSIGN",
  LogicalOr = "LOGICAL_OR",
  LogicalAnd = "LOGICAL_AND",
  LogicalNot = "LOGICAL_NOT",
  EqualityOperator = "EQUALITY_OPERATOR",
  RationalOperator = "RELATIONAL_OPERATOR",
  AdditiveOperator = "ADDITIVE_OPERATOR",
  MultiplicativeOperator = "MULTIPLICATIVE_OPERATOR",
  Number = "NUMBER",
  String = "STRING",
  True = "true",
  False = "false",
  Null = "null",
  Now = "now",
}

export enum AstType {
  ExpressionStatement = "ExpressionStatement",
  ConditionalExpression = "ConditionalExpression",
  AssignmentExpression = "AssignmentExpression",
  Identifier = "Identifier",
  MemberExpression = "MemberExpression",
  LogicalANDExpression = "LogicalANDExpression",
  EqualityExpression = "EqualityExpression",
  RelationalExpression = "RelationalExpression",
  AdditiveExpression = "AdditiveExpression",
  MultiplicativeExpression = "MultiplicativeExpression",
  UnaryExpression = "UnaryExpression",
  LogicalExpression = "LogicalExpression",
  BinaryExpression = "BinaryExpression",
  CallExpression = "CallExpression",
  ArrayExpression = "ArrayExpression",
  ObjectExpression = "ObjectExpression",
  Literal = "Literal",
  BooleanLiteral = "BooleanLiteral",
  NullLiteral = "NullLiteral",
  NowLiteral = "NowLiteral",
  NumericLiteral = "NumericLiteral",
  StringLiteral = "StringLiteral",
  BlockStatement = "BlockStatement",
  Property = "Property",
}
