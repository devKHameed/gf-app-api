module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json", "./packages/*/tsconfig.json"],
  },
  plugins: ["@typescript-eslint"],
  rules: {
    "@typescript-eslint/no-unsafe-assignment": ["off"],
    "@typescript-eslint/no-unsafe-member-access": ["off"],
    indent: ["error", 2, { SwitchCase: 1, offsetTernaryExpressions: true }],
    quotes: ["error", "double", { avoidEscape: true }],
    semi: ["error", "always"],
    "@typescript-eslint/no-non-null-assertion": ["off"],
    "@typescript-eslint/no-explicit-any": ["off"],
    "@typescript-eslint/restrict-template-expressions": ["off"],
  },
  overrides: [
    {
      files: ["*.ts", "*.tsx"],
    },
  ],
};
