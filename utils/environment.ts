import Joi from "joi";

interface EnvironmentSchema {
	DEPLOYER_PRIVATE_KEY: string;
	ETHERSCAN_API_KEY: string;
	ROOT_CHAIN_RPC: string;
	ROOT_GAS_PRICE: number;
	CHILD_CHAIN_RPC: string;
	CHILD_GAS_PRICE: number;
	STAKE_MANAGER: string;
	MATIC_TOKEN: string;
	MANAGER: string;
	INSTANT_POOL_OWNER: string;
	TREASURY: string;
	FX_ROOT: string;
	FX_CHILD: string;
	CHECKPOINT_MANAGER: string;
	DEFENDER_TEAM_API_KEY: string;
	DEFENDER_TEAM_API_SECRET_KEY: string;
	REPORT_GAS: boolean;
}

const ADDRESS_REGEX = /^0x[0-9A-Fa-f]{40}$/;

export function extractEnvironmentVariables(): EnvironmentSchema {
	const envSchema = Joi.object()
		.keys({
			DEPLOYER_PRIVATE_KEY: Joi.string()
				.required()
				.length(64)
				.alphanum()
				.description("Private key for deployer"),
			ETHERSCAN_API_KEY: Joi.string()
				.required()
				.length(34)
				.alphanum()
				.description("API key for Etherscan"),
			ROOT_CHAIN_RPC: Joi.string()
				.required()
				.uri()
				.description("RPC node URL for root chain (Ethereum)"),
			ROOT_GAS_PRICE: Joi.number()
				.optional()
				.default(0)
				.description("Gas price in root chain (Ethereum)"),
			CHILD_CHAIN_RPC: Joi.string()
				.required()
				.uri()
				.description("RPC node URL for child chain (Polygon)"),
			CHILD_GAS_PRICE: Joi.number()
				.optional()
				.default("0")
				.description("Gas price in child chain (Polygon)"),
			STAKE_MANAGER: Joi.string()
				.optional()
				.regex(ADDRESS_REGEX)
				.allow("")
				.description("Address of StakeManager contract"),
			MATIC_TOKEN: Joi.string()
				.optional()
				.regex(ADDRESS_REGEX)
				.allow("")
				.description("Address of MaticToken contract"),
			MANAGER: Joi.string()
				.optional()
				.regex(ADDRESS_REGEX)
				.allow("")
				.description("Address of manager account"),
			INSTANT_POOL_OWNER: Joi.string()
				.optional()
				.regex(ADDRESS_REGEX)
				.allow("")
				.description(
					"Address of instant pool manager account. Deprecated"
				),
			TREASURY: Joi.string()
				.optional()
				.regex(ADDRESS_REGEX)
				.allow("")
				.description("Address of treasury account"),
			FX_ROOT: Joi.string()
				.optional()
				.regex(ADDRESS_REGEX)
				.allow("")
				.description("Address of FxRoot contract"),
			FX_CHILD: Joi.string()
				.optional()
				.regex(ADDRESS_REGEX)
				.allow("")
				.description("Address of FxChild contract"),
			CHECKPOINT_MANAGER: Joi.string()
				.optional()
				.regex(ADDRESS_REGEX)
				.allow("")
				.description("Address of CheckpointManager contract"),
			DEFENDER_TEAM_API_KEY: Joi.string()
				.required()
				.length(32)
				.alphanum()
				.description("API key for OpenZeppelin Defender"),
			DEFENDER_TEAM_API_SECRET_KEY: Joi.string()
				.required()
				.length(64)
				.alphanum()
				.description("API secret key for OpenZeppelin Defender"),
			REPORT_GAS: Joi.boolean()
				.optional()
				.default(false)
				.description("Flag to report gas prices or not"),
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
