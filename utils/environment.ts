import Joi from "joi";
import { Provider } from "./network";

interface EnvironmentSchema {
	API_PROVIDER: Provider;
	HOLESKY_API_KEY: string;
	AMOY_API_KEY: string;
	ETHEREUM_API_KEY: string;
	POLYGON_API_KEY: string;
	ETHERSCAN_API_KEY: string;
	POLYGONSCAN_API_KEY: string;
	OZ_DEFENDER_API_KEY: string;
	OZ_DEFENDER_API_SECRET: string;
	FORKING_BLOCK_NUMBER: number;
	COINMARKETCAP_API_KEY: string;
	GAS_REPORTER_NETWORK: string;
	REPORT_GAS: boolean;
	DEPLOYER_MNEMONIC: string;
	DEPLOYER_PASSPHRASE: string;
	DEPLOYER_ADDRESS: string;
}

const API_KEY_REGEX = /^[0-9A-Za-z_-]{32}$/;
const GUID_V4_REGEX =
	/^[{]?[0-9A-Fa-f]{8}-([0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12}[}]?$/;
const MNEMONIC_REGEX = /^([a-z ]+){12,24}$/;
const ADDRESS_REGEX = /^0x[0-9A-Fa-f]{40}$/;

export function extractEnvironmentVariables(): EnvironmentSchema {
	const envSchema = Joi.object()
		.keys({
			API_PROVIDER: Joi.string()
				.optional()
				.valid("alchemy", "infura")
				.default("alchemy")
				.default("RPC provider name"),
			HOLESKY_API_KEY: Joi.string()
				.required()
				.regex(API_KEY_REGEX)
				.description("API key for Holesky"),
			AMOY_API_KEY: Joi.string()
				.required()
				.regex(API_KEY_REGEX)
				.description("API key for Amoy"),
			ETHEREUM_API_KEY: Joi.string()
				.required()
				.regex(API_KEY_REGEX)
				.description("API key for Ethereum"),
			POLYGON_API_KEY: Joi.string()
				.required()
				.regex(API_KEY_REGEX)
				.description("API key for Polygon"),
			ETHERSCAN_API_KEY: Joi.string()
				.required()
				.length(34)
				.alphanum()
				.description("API key for Etherscan"),
			POLYGONSCAN_API_KEY: Joi.string()
				.required()
				.length(34)
				.alphanum()
				.description("API key for Polygonscan"),
			OZ_DEFENDER_API_KEY: Joi.string()
				.required()
				.length(32)
				.alphanum()
				.description("API key for Openzeppelin Defender"),
			OZ_DEFENDER_API_SECRET: Joi.string()
				.required()
				.length(64)
				.alphanum()
				.description("API secret for Openzeppelin Defender"),
			FORKING_BLOCK_NUMBER: Joi.number()
				.optional()
				.integer()
				.min(0)
				.default(0)
				.description("Block number for Hardhat forking on Ethereum"),
			COINMARKETCAP_API_KEY: Joi.string()
				.optional()
				.allow("")
				.regex(GUID_V4_REGEX)
				.description("API key for Coinmarketcap"),
			GAS_REPORTER_NETWORK: Joi.string()
				.optional()
				.allow("ethereum", "polygon")
				.default("ethereum")
				.description("Gas reporter network"),
			REPORT_GAS: Joi.boolean()
				.optional()
				.default(false)
				.description("Report gas prices or not"),
			DEPLOYER_MNEMONIC: Joi.string()
				.optional()
				.default(
					"test test test test test test test test test test test junk"
				)
				.regex(MNEMONIC_REGEX)
				.description("Mnemonic phrase of deployer account"),
			DEPLOYER_PASSPHRASE: Joi.string()
				.optional()
				.allow("")
				.description("Passphrase of deployer account"),
			DEPLOYER_ADDRESS: Joi.string()
				.required()
				.regex(ADDRESS_REGEX)
				.description("Address of deployer account"),
		})
		.unknown() as Joi.ObjectSchema<EnvironmentSchema>;

	const { value: envVars, error } = envSchema
		.prefs({
			errors: {
				label: "key",
			},
		})
		.validate(process.env);
	if (error) {
		throw new Error(error.annotate());
	}
	return envVars;
}
