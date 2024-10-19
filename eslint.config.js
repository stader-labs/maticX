// eslint-disable-next-line no-undef,@typescript-eslint/no-require-imports
const eslint = require("@eslint/js");
// eslint-disable-next-line no-undef,@typescript-eslint/no-require-imports
const tseslint = require("typescript-eslint");
// eslint-disable-next-line no-undef,@typescript-eslint/no-require-imports
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");

// eslint-disable-next-line no-undef
module.exports = tseslint.config(
	{
		ignores: [
			".openzeppelin/*",
			"artifacts/*",
			"cache/*",
			"contracts/*",
			"coverage/*",
			"crytic-corpus/*",
			"crytic-export/*",
			"node_modules/*",
			"typechain-types/*",
		],
	},
	eslint.configs.recommended,
	...tseslint.configs.strict,
	...tseslint.configs.stylistic,
	eslintPluginPrettierRecommended,
	{
		rules: {
			"@typescript-eslint/no-unused-expressions": "off",
		},
		languageOptions: {
			parserOptions: {
				warnOnUnsupportedTypeScriptVersion: false,
			},
		},
	}
);
