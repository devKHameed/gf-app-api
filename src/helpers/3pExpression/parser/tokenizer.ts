import { Token } from "./enum";

type Matcher = [RegExp, string | null];
export type NextTokenType = Token | string | null;
export type NextToken<T extends NextTokenType = string> = {
  type: T;
  value: string;
};

/**
 * Tokenizer spec.
 */
const matcher: Matcher[] = [
  // Implement here...
  [/^\s+/, null],
  [/^\/\/.*/, null],
  [/^\/\*[\s\S]*?\*\//, null],

  [/^;/, ";"],
  [/^{/, "{"],
  [/^}/, "}"],
  [/^\(/, "("],
  [/^\)/, ")"],
  [/^,/, ","],
  [/^\?/, "?"],
  [/^:/, ":"],
  [/^\./, "."],
  [/^\[/, "["],
  [/^\]/, "]"],

  [/^\btrue\b/, Token.True],
  [/^\bfalse\b/, Token.False],
  [/^\bnull\b/, Token.Null],
  [/^\bnow\b/, Token.Now],

  [/^[+-]?([0-9]*[.])?[0-9]+/, Token.Number],
  [/^\w+/, Token.Identifier],

  [/^[=!]={1,2}/, Token.EqualityOperator],
  [/^=/, Token.SimpleAssign],
  [/^[*/+-]=/, Token.ComplexAssign],

  [/^[+-]/, Token.AdditiveOperator],
  [/^[*/%]/, Token.MultiplicativeOperator],
  [/^[<>]=?/, Token.RationalOperator],

  [/^&&/, Token.LogicalAnd],
  [/^\|\|/, Token.LogicalOr],
  [/^!/, Token.LogicalNot],

  [/^"[^"]*"/, Token.String],
  [/^'[^']*'/, Token.String],
];

/**
 * Tokenizer class.
 *
 * Lazily pulls a token from a stream.
 */
export class Tokenizer {
  private _string: string;
  private _cursor: number;

  constructor() {
    this._string = "";
    this._cursor = 0;
  }

  /**
   * Initializes the string.
   */
  init(str: string) {
    this._string = str;
    this._cursor = 0;
  }

  /**
   * Whther the tokenizer reached EOF.
   */
  isEOF() {
    return this._cursor === this._string.length;
  }

  /**
   * Whether we still have more tokens.
   */
  hasMoreTokens() {
    return this._cursor < this._string.length;
  }

  /**
   * Obtains next token.
   */
  getNextToken(): NextToken | null {
    // Implement here...
    if (!this.hasMoreTokens()) {
      return null;
    }

    const str = this._string.slice(this._cursor);

    for (const [regex, type] of matcher) {
      const value = this.match(regex, str);
      if (value == null) {
        continue;
      }

      if (type == null) {
        return this.getNextToken();
      }

      return {
        type,
        value,
      };
    }

    throw new SyntaxError(`Unexpected token: "${str[0]}"`);
  }

  private match(regex: RegExp, str: string) {
    const matched = regex.exec(str);
    if (matched && matched[0] !== null) {
      this._cursor += matched[0].length;
      return matched[0];
    }

    return null;
  }
}
