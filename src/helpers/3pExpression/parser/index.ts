/**
 * Letter parser: recursive descent implementation.
 */
import { AstType, Token } from "./enum";
import { NextToken, Tokenizer } from "./tokenizer";
import {
  AdditiveExpression,
  Argument,
  ArrayExpression,
  BinaryExpression,
  BlockStatement,
  BooleanLiteral,
  CallExpression,
  CallMemberExpression,
  ConditionalExpression,
  EqualityExpression,
  Expression,
  ExpressionStatement,
  Identifier,
  Literal,
  LogicalANDExpression,
  LogicalExpression,
  LogicalORExpression,
  MemberExpression,
  MultiplicativeExpression,
  NowLiteral,
  NullLiteral,
  NumericLiteral,
  ObjectExpression,
  PrimaryExpression,
  Program,
  Property,
  RelationalExpression,
  Statement,
  StringLiteral,
  UnaryExpression,
} from "./types";

export class Parser {
  private readonly _tokenizer: Tokenizer;
  private _string: string;
  private _lookahead: NextToken | null;

  /**
   * Initializes the parser.
   */
  constructor() {
    this._string = "";
    this._tokenizer = new Tokenizer();
    this._lookahead = null;
  }

  /**
   * Parses a string into an AST.
   */
  parse(str: string): Program {
    // Implement here...
    this._string = str;
    this._tokenizer.init(str);

    this._lookahead = this._tokenizer.getNextToken();

    return this.Program();
  }

  /**
   * Main entry point.
   *
   * Program
   *   : StatementList
   *   ;
   */
  Program(): Program {
    // Implement here...
    return this.StatementList();
  }

  /**
   * StatementList
   *   : Statement
   *   | StatementList Statement -> Statement Statement Statement Statement
   *   ;
   */
  StatementList(stopLookahead: string | null = null): Statement[] {
    // Implement here...
    const statementList = [this.Statement()];

    while (this._lookahead !== null && this._lookahead.type !== stopLookahead) {
      statementList.push(this.Statement());
    }

    return statementList;
  }

  /**
   * Statement
   *   : ExpressionStatement
   *   | BlockStatement
   *   | EmptyStatement
   *   | VariableStatement
   *   | IfStatement
   *   | IterationStatement
   *   | BreakStatement
   *   | ContinueStatement
   *   | FunctionDeclaration
   *   | ReturnStatement
   *   | ClassDeclaration
   *   ;
   */
  Statement(): Statement {
    // Implement here...
    switch (this._lookahead?.type) {
      case "{":
        return this.BlockStatement();
      default:
        return this.ExpressionStatement();
    }
  }

  /**
   * BlockStatement
   *   : '{' OptStatementList '}'
   *   ;
   */
  BlockStatement(): BlockStatement {
    // Implement here...
    this._consume("{");
    const body = this._lookahead?.type === "}" ? [] : this.StatementList("}");
    this._consume("}");

    return {
      type: AstType.BlockStatement,
      body,
    };
  }

  /**
   * ExpressionStatement
   *   : Expression ';'
   *   ;
   */
  ExpressionStatement(): ExpressionStatement {
    // Implement here...
    const expression = this.Expression();

    // if (this._lookahead) {
    //   this._consume(";");
    // }

    return {
      type: AstType.ExpressionStatement,
      expression,
    };
  }

  /**
   * Expression
   *   : AssignmentExpression
   *   ;
   */
  Expression(): Expression {
    return this.AssignmentExpression();
  }

  /**
   * AssignmentExpression
   *   : ConditionalExpression
   *   | LeftHandSideExpression AssignmentOperator AssignmentExpression
   *   ;
   */
  AssignmentExpression(): Expression {
    // Implement here...
    let left: unknown;
    switch (this._lookahead?.type) {
      case "[":
        left = this.ArrayExpression();
        break;
      case "{":
        left = this.ObjectExpression();
        break;
      default:
        left = this.ConditionalExpression();
    }
    if (!this._lookahead || !this._isAssignmentOperator(this._lookahead.type)) {
      return left as Expression;
    }

    return {
      type: AstType.AssignmentExpression,
      operator: this.AssignmentOperator(),
      left: this._checkValidAssignmentTarget(
        left as Identifier | MemberExpression
      ),
      right: this.AssignmentExpression(),
    };
  }

  ObjectExpression(): ObjectExpression {
    this._consume("{");
    const properties =
      this._lookahead?.type === "}" ? [] : this.PropertyList("}");
    this._consume("}");

    return {
      type: AstType.ObjectExpression,
      properties,
    };
  }

  PropertyList(stopToken: string | null): Property[] {
    const properties = [this.Property()];

    while (this._lookahead && this._lookahead.type !== stopToken) {
      this._consume(",");
      properties.push(this.Property());
    }

    return properties;
  }

  Property(): Property {
    const key = this.Identifier();
    this._consume(":");
    const value = this.AssignmentExpression();

    return {
      type: AstType.Property,
      key,
      value,
    };
  }

  ArrayExpression(): ArrayExpression {
    this._consume("[");
    const elements =
      this._lookahead?.type === "]" ? [] : this.ExpressionList("]");
    this._consume("]");

    return {
      type: AstType.ArrayExpression,
      elements,
    };
  }

  ExpressionList(stopToken: string): Expression[] {
    const expressions = [this.AssignmentExpression()];

    while (this._lookahead && this._lookahead.type !== stopToken) {
      this._consume(",");
      expressions.push(this.AssignmentExpression());
    }

    return expressions;
  }

  /**
   * Identifier
   *   : IDENTIFIER
   *   ;
   */
  Identifier(): Identifier {
    const name = this._consume(Token.Identifier).value;
    return {
      type: AstType.Identifier,
      name,
    };
  }

  /**
   * Extra check whether it's valid assignment target.
   */
  _checkValidAssignmentTarget(node: Identifier | MemberExpression) {
    if (
      node.type === AstType.Identifier ||
      node.type === AstType.MemberExpression
    ) {
      return node;
    }
    throw new SyntaxError("Invalid left-hand side in assignment expression");
  }

  /**
   * Whether the token is an assignment operator.
   */
  _isAssignmentOperator(tokenType: string) {
    return (
      tokenType === Token.SimpleAssign || tokenType === Token.ComplexAssign
    );
  }

  /**
   * AssignmentOperator
   *   : SIMPLE_ASSIGN
   *   | COMPLEX_ASSIGN
   *   ;
   */
  AssignmentOperator() {
    if (this._lookahead?.type === Token.SimpleAssign) {
      return this._consume(Token.SimpleAssign);
    }
    return this._consume(Token.ComplexAssign);
  }

  ConditionalExpression(): ConditionalExpression | LogicalORExpression {
    const left = this.LogicalORExpression();

    if (this._lookahead && this._lookahead.type === "?") {
      this._lookahead = this._consume("?");
      return {
        type: AstType.ConditionalExpression,
        test: left as LogicalExpression,
        consequent: this.Statement(),
        alternative:
          this._lookahead && this._lookahead.type === ":"
            ? this._consume(":") && this.Statement()
            : null,
      };
    }

    return left;
  }

  /**
   * Logical OR expression.
   *
   *   x || y
   *
   * LogicalORExpression
   *   : LogicalORExpression
   *   | LogicalORExpression LogicalOr LogicalANDExpression
   *   ;
   */
  LogicalORExpression(): LogicalORExpression {
    // Implement here...
    return this._LogicalExpression<LogicalANDExpression>(
      AstType.LogicalANDExpression,
      Token.LogicalOr
    );
  }

  /**
   * Logical AND expression.
   *ArgumentList
   *   x && y
   *
   * LogicalANDExpression
   *   : EqualityExpression
   *   | LogicalANDExpression LOGICAL_AND EqualityExpression
   *   ;
   */
  LogicalANDExpression(): LogicalANDExpression {
    // Implement here...
    return this._LogicalExpression<EqualityExpression>(
      AstType.EqualityExpression,
      Token.LogicalAnd
    );
  }

  /**
   * EQUALITY_OPERATOR: ==, !=
   *
   *   x == y
   *   x != y
   *
   * EqualityExpression
   *   : RelationalExpression
   *   | EqualityExpression EQUALITY_OPERATOR RelationalExpression
   *   ;
   */
  EqualityExpression(): EqualityExpression {
    // Implement here...
    return this._BinaryExpression<RelationalExpression>(
      AstType.RelationalExpression,
      Token.EqualityOperator
    );
  }

  /**
   * RELATIONAL_OPERATOR: >, >=, <, <=
   *
   *   x > y
   *   x >= y
   *   x < y
   *   x <= y
   *
   * RelationalExpression
   *   : AdditiveExpression
   *   | RelationalExpression RELATIONAL_OPERATOR AdditiveExpression
   *   ;
   */
  RelationalExpression(): RelationalExpression {
    // Implement here...
    return this._BinaryExpression<AdditiveExpression>(
      AstType.AdditiveExpression,
      Token.RationalOperator
    );
  }

  /**
   * AdditiveExpression
   *   : MultiplicativeExpression
   *   | AdditiveExpression ADDITIVE_OPERATOR MultiplicativeExpression
   *   ;
   */
  AdditiveExpression(): AdditiveExpression {
    // Implement here...
    return this._BinaryExpression<MultiplicativeExpression>(
      AstType.MultiplicativeExpression,
      Token.AdditiveOperator
    );
  }

  /**
   * MultiplicativeExpression
   *   : UnaryExpression
   *   | MultiplicativeExpression MULTIPLICATIVE_OPERATOR UnaryExpression
   *   ;
   */
  MultiplicativeExpression(): MultiplicativeExpression {
    // Implement here...
    return this._BinaryExpression<UnaryExpression>(
      AstType.UnaryExpression,
      Token.MultiplicativeOperator
    );
  }

  /**
   * Generic helper for LogicalExpression nodes.
   */
  _LogicalExpression<E extends LogicalANDExpression | EqualityExpression>(
    builderName: AstType.LogicalANDExpression | AstType.EqualityExpression,
    operatorToken: Token
  ): E | LogicalExpression<E> {
    // Implement here...
    let left = this[builderName]() as E | LogicalExpression<E>;

    while (this._lookahead && this._lookahead.type === operatorToken) {
      const operator = this._consume(operatorToken).value;

      const right = this[builderName]() as E;

      left = {
        type: AstType.LogicalExpression,
        operator,
        left: left as E,
        right,
      };
    }

    return left;
  }

  /**
   * Generic binary expression.
   */
  _BinaryExpression<
    E extends
      | UnaryExpression
      | MultiplicativeExpression
      | AdditiveExpression
      | RelationalExpression
  >(
    builderName:
      | AstType.RelationalExpression
      | AstType.AdditiveExpression
      | AstType.MultiplicativeExpression
      | AstType.UnaryExpression,
    operatorToken: Token
  ): E | BinaryExpression<E> {
    let left = this[builderName]() as E | BinaryExpression<E>;

    while (this._lookahead && this._lookahead.type === operatorToken) {
      const operator = this._consume(operatorToken).value;

      const right = this[builderName]() as E;

      left = {
        type: AstType.BinaryExpression,
        operator,
        left: left as E,
        right,
      };
    }

    return left;
  }

  /**
   * UnaryExpression
   *   : LeftHandSideExpression
   *   | ADDITIVE_OPERATOR UnaryExpression
   *   | LOGICAL_NOT UnaryExpression
   *   ;
   */
  UnaryExpression(): UnaryExpression | CallMemberExpression {
    let operator: string | null = null;
    switch (this._lookahead?.type) {
      case Token.AdditiveOperator:
        operator = this._consume(Token.AdditiveOperator).value;
        break;
      case Token.LogicalNot:
        operator = this._consume(Token.LogicalNot).value;
        break;
      default:
    }

    if (operator != null) {
      return {
        type: AstType.UnaryExpression,
        operator,
        argument: this.UnaryExpression(),
      };
    }

    return this.LeftHandSideExpression();
  }

  /**
   * LeftHandSideExpression
   *   : CallMemberExpression
   *   ;
   */
  LeftHandSideExpression(): CallMemberExpression {
    return this.CallMemberExpression();
  }

  /**
   * CallMemberExpression
   *   : MemberExpression
   *   | CallExpression
   *   ;
   */
  CallMemberExpression(): CallMemberExpression {
    // Implement here...
    const member = this.MemberExpression() as MemberExpression;

    if (this._lookahead && this._lookahead.type === "(") {
      return this._CallExpression(member);
    }

    return member;
  }

  /**
   * Generic call expression helper.
   *
   * CallExpression
   *   : Callee Arguments
   *   ;
   *
   * Callee
   *   : MemberExpression
   *   | Super
   *   | CallExpression
   *   ;
   */
  _CallExpression(callee: MemberExpression | CallExpression): CallExpression {
    // Implement here...
    let callExpression: CallExpression = {
      type: AstType.CallExpression,
      callee,
      arguments: this.Arguments(),
    };

    if (this._lookahead && this._lookahead.type === "(") {
      callExpression = this._CallExpression(callExpression);
    }

    return callExpression;
  }

  /**
   * Arguments
   *   : '(' OptArgumentList ')'
   *   ;
   */
  Arguments(): Argument[] {
    // Implement here...
    this._consume("(");
    const argumentList =
      this._lookahead?.type !== ")" ? this.ArgumentList() : [];
    this._consume(")");

    return argumentList;
  }

  /**
   * ArgumentList
   *   : AssignmentExpression
   *   | ArgumentList ',' AssignmentExpression
   *   ;
   */
  ArgumentList(): Argument[] {
    // Implement here...
    const argumentList: Argument[] = [];

    do {
      argumentList.push(this.AssignmentExpression());
    } while (
      this._lookahead &&
      this._lookahead.type === "," &&
      this._consume(",") &&
      (this._lookahead as any).type !== ")"
    );

    return argumentList;
  }

  /**
   * MemberExpression
   *   : PrimaryExpression
   *   | MemberExpression '.' Identifier
   *   | MemberExpression '[' Expression ']'
   *   ;
   */
  MemberExpression(): MemberExpression | PrimaryExpression {
    // Implement here...
    let obj: MemberExpression | PrimaryExpression = this.PrimaryExpression();

    while (
      this._lookahead &&
      (this._lookahead.type === "." || this._lookahead.type === "[")
    ) {
      if (this._lookahead.type === ".") {
        this._consume(".");
        const property = this.Identifier();
        obj = {
          type: AstType.MemberExpression,
          computed: false,
          object: obj,
          property,
        } as MemberExpression;
      } else if (this._lookahead.type === "[") {
        this._consume("[");
        const property = this.Expression();
        this._consume("]");
        obj = {
          type: AstType.MemberExpression,
          computed: true,
          object: obj,
          property,
        } as MemberExpression;
      }
    }
    return obj;
  }

  /**
   * PrimaryExpression
   *   : Literal
   *   | ParenthesizedExpression
   *   | Identifier
   *   | ThisExpression
   *   | NewExpression
   *   ;
   */
  PrimaryExpression(): PrimaryExpression {
    // Implement here...
    if (this._isLiteral(this._lookahead?.type)) {
      return this.Literal();
    }
    switch (this._lookahead?.type) {
      case "(":
        return this.ParenthesizedExpression();
      case Token.Identifier:
        return this.Identifier();
      default:
        return this.LeftHandSideExpression();
    }
  }

  /**
   * Whether the token is a literal.
   */
  _isLiteral(tokenType?: string) {
    // Implement here...
    return (
      tokenType === Token.Number ||
      tokenType === Token.String ||
      tokenType === Token.True ||
      tokenType === Token.False ||
      tokenType === Token.Null ||
      tokenType === Token.Now
    );
  }

  /**
   * ParenthesizedExpression
   *   : '(' Expression ')'
   *   ;
   */
  ParenthesizedExpression(): Expression {
    // Implement here...
    this._consume("(");
    const expression = this.Expression();
    this._consume(")");

    return expression;
  }

  /**
   * Literal
   *   : NumericLiteral
   *   | StringLiteral
   *   | BooleanLiteral
   *   | NullLiteral
   *   ;
   */
  Literal(): Literal {
    // Implement here...
    switch (this._lookahead?.type) {
      case Token.Number:
        return this.NumericLiteral();
      case Token.String:
        return this.StringLiteral();
      case Token.True:
        return this.BooleanLiteral(true);
      case Token.False:
        return this.BooleanLiteral(false);
      case Token.Null:
        return this.NullLiteral();
      case Token.Now:
        return this.NowLiteral();
      default:
    }

    throw new SyntaxError("Literal: Unexpected literal production");
  }

  /**
   * BooleanLiteral
   *   : 'true'
   *   | 'false'
   *   ;
   */
  BooleanLiteral(value: boolean): BooleanLiteral {
    this._consume(value ? Token.True : Token.False);
    return {
      type: AstType.BooleanLiteral,
      value,
    };
  }

  /**
   * NullLiteral
   *   : 'null'
   *   ;
   */
  NullLiteral(): NullLiteral {
    // Implement here...
    this._consume(Token.Null);
    return {
      type: AstType.NullLiteral,
      value: null,
    };
  }

  /**
   * NowLiteral
   *   : 'now'
   *   ;
   */
  NowLiteral(): NowLiteral {
    // Implement here...
    this._consume(Token.Now);
    return {
      type: AstType.NowLiteral,
      value: "now" as const,
    };
  }

  /**
   * StringLiteral
   *   : STRING
   *   ;
   */
  StringLiteral(): StringLiteral {
    const token = this._consume(Token.String);
    return {
      type: AstType.StringLiteral,
      value: token.value.slice(1, -1),
    };
  }

  /**
   * NumericLiteral
   *   : NUMBER
   *   ;
   */
  NumericLiteral(): NumericLiteral {
    const token = this._consume(Token.Number);
    return {
      type: AstType.NumericLiteral,
      value: Number(token.value),
    };
  }

  /**
   * Expects a token of a given type.
   */
  _consume(tokenType: string) {
    // Implement here...
    const token = this._lookahead;
    if (token == null) {
      const errStr = `Unexpected end of input, expected: "${tokenType}"`;
      throw new SyntaxError(errStr);
    }
    if (token.type !== tokenType) {
      const errStr = `Unexpected Token: "${token.value}", expected: "${tokenType}"`;
      throw new SyntaxError(errStr);
    }

    this._lookahead = this._tokenizer.getNextToken();

    return token;
  }
}
