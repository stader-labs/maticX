import Joi from "joi";

interface EnvironmentSchema {
	DEPLOYER_PRIVATE_KEY: string;
	ETHERSCAN_API_KEY: string;
	ROOT_CHAIN_RPC: string;
	CHILD_CHAIN_RPC: string;
	STAKE_MANAGER: string;
	MATIC_TOKEN: string;
	MANAGER: string;
	INSTANT_POOL_OWNER: string;
	TREASURY: string;
	ROOT_GAS_PRICE: number;
	CHILD_GAS_PRICE: number;
	DEFENDER_TEAM_API_KEY: string;
	DEFENDER_TEAM_API_SECRET_KEY: string;
	FX_ROOT: string;
	FX_CHILD: string;
	CHECKPOINT_MANAGER: string;
	REPORT_GAS: boolean;
}

export function extractEnvironmentVariables(): EnvironmentSchema {
	const envSchema = Joi.object()
		.keys({
			DEPLOYER_PRIVATE_KEY: Joi.string().optional(),
			ETHERSCAN_API_KEY: Joi.string().optional(),
			ROOT_CHAIN_RPC: Joi.string().optional().allow(""),
			CHILD_CHAIN_RPC: Joi.string().optional().allow(""),
			STAKE_MANAGER: Joi.string().optional().allow(""),
			MATIC_TOKEN: Joi.string().optional().allow(""),
			MANAGER: Joi.string().optional().allow(""),
			INSTANT_POOL_OWNER: Joi.string().optional().allow(""),
			TREASURY: Joi.string().optional().allow(""),
			ROOT_GAS_PRICE: Joi.number().optional().default("0"),
			CHILD_GAS_PRICE: Joi.number().optional().default("0"),
			DEFENDER_TEAM_API_KEY: Joi.string().optional(),
			DEFENDER_TEAM_API_SECRET_KEY: Joi.string().optional(),
			FX_ROOT: Joi.string().optional().allow(""),
			FX_CHILD: Joi.string().optional().allow(""),
			CHECKPOINT_MANAGER: Joi.string().optional().allow(""),
			REPORT_GAS: Joi.boolean().optional().default(false),
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
