module.exports = {
  root: true,
  env: {
    es6: true,
    node: true
  },
  extends: [
    "prettier",
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended"
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.dev.json"],
    sourceType: "module"
  },
  ignorePatterns: [
    "/lib/**/*" // Ignore built files.
  ],
  plugins: ["@typescript-eslint", "import", "prettier"],
  rules: {
    quotes: ["error", "double", { avoidEscape: true }],
    indent: "off",
    "valid-jsdoc": "off",
    "@typescript-eslint/indent": "off",
    "import/no-unresolved": 0,
    "quote-props": 0,
    "object-curly-spacing": 0,
    "@typescript-eslint/explicit-module-boundary-types": 0,
    "max-len": 0,
    camelcase: 0,
    "require-jsdoc": 0,
    "@typescript-eslint/no-var-requires": 0,
    "@typescript-eslint/ban-types": 0,
    "space-before-function-paren": 0,
    "new-cap": 0,
    "operator-linebreak": 0,
    "prettier/prettier": 2,
    "comma-dangle": 0,
    "no-tabs": 0
  }
};
