import Joi from "joi";
import { Provider } from "./network";

interface EnvironmentSchema {
	RPC_PROVIDER: Provider;
	SEPOLIA_API_KEY: string;
	AMOY_API_KEY: string;
	ETHEREUM_API_KEY: string;
	POLYGON_API_KEY: string;
	ETHERSCAN_API_KEY: string;
	POLYGONSCAN_API_KEY: string;
	FORKING_BLOCK_NUMBER: number;
	COINMARKETCAP_API_KEY: string;
	GAS_REPORTER_NETWORK: string;
	GAS_PRICE_GWEI: number;
	REPORT_GAS: boolean;
	DEPLOYER_MNEMONIC: string;
	DEPLOYER_PASSPHRASE: string;
	DEPLOYER_ADDRESS: string;
}

const API_KEY_REGEX = /^[0-9A-Za-z_-]{32}$/;
const MNEMONIC_REGEX = /^([a-z ]+){12,24}$/;
const ADDRESS_REGEX = /^0x[0-9A-Fa-f]{40}$/;

export function extractEnvironmentVariables(): EnvironmentSchema {
	const envSchema = Joi.object()
		.keys({
			RPC_PROVIDER: Joi.string()
				.optional()
				.valid("alchemy", "ankr", "infura")
				.default("ankr")
				.default("RPC provider name"),
			SEPOLIA_API_KEY: Joi.string()
				.required()
				.regex(API_KEY_REGEX)
				.description("API key for Sepolia"),
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
			FORKING_BLOCK_NUMBER: Joi.number()
				.optional()
				.integer()
				.min(0)
				.default(0)
				.description("Block number for Hardhat forking on Ethereum"),
			COINMARKETCAP_API_KEY: Joi.string()
				.optional()
				.allow("")
				.uuid({ version: "uuidv4" })
				.description("API key for Coinmarketcap"),
			GAS_REPORTER_NETWORK: Joi.string()
				.optional()
				.allow("ethereum", "polygon")
				.default("ethereum")
				.description("Gas reporter network"),
			GAS_PRICE_GWEI: Joi.number()
				.optional()
				.integer()
				.min(0)
				.default(0)
				.description("Gas price in Gwei"),
			REPORT_GAS: Joi.boolean()
				.optional()
				.default(false)
				.description("Flag to report gas price or not"),
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
