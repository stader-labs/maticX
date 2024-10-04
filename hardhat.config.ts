import * as dotenv from "dotenv";
import { HardhatNetworkMiningConfig } from "hardhat/types";
import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-solhint";
import "@nomiclabs/hardhat-waffle";
import "@openzeppelin/hardhat-defender";
import "@openzeppelin/hardhat-upgrades";
import "@typechain/hardhat";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "./tasks/deploy-validator-registry";
import { extractEnvironmentVariables } from "./utils/environment";

const envSuffix = process.env.NODE_ENV === "main" ? "" : ".test";
const exampleSuffix = process.env.CI ? ".example" : "";

dotenv.config({
	path: `.env${envSuffix}${exampleSuffix}`,
});

const envVars = extractEnvironmentVariables();

const mining: HardhatNetworkMiningConfig = {
	auto: true,
	interval: 1_000,
	mempool: {
		order: "fifo",
	},
};

const config: HardhatUserConfig = {
	defaultNetwork: "hardhat",
	solidity: {
		version: "0.8.7",
		settings: {
			optimizer: {
				enabled: true,
				runs: 200,
			},
		},
	},
	networks: {
		hardhat: {
			initialBaseFeePerGas: 0, // See https://github.com/sc-forks/solidity-coverage/issues/652#issuecomment-896330136
			blockGasLimit: 30_000_000,
			mining,
			forking: {
				url: envVars.ROOT_CHAIN_RPC,
				blockNumber: envVars.FORKING_ROOT_BLOCK_NUMBER,
				enabled: false,
			},
		},
		localhost: {
			url: "http://127.0.0.1:8545",
			blockGasLimit: 30_000_000,
			mining,
		},
		testnet: {
			url: envVars.ROOT_CHAIN_RPC,
			accounts: [envVars.DEPLOYER_PRIVATE_KEY],
			gasPrice: envVars.ROOT_GAS_PRICE,
		},
		mainnet: {
			url: envVars.ROOT_CHAIN_RPC,
			accounts: [envVars.DEPLOYER_PRIVATE_KEY],
			gasPrice: envVars.ROOT_GAS_PRICE,
		},
		matic: {
			url: envVars.CHILD_CHAIN_RPC,
			accounts: [envVars.DEPLOYER_PRIVATE_KEY],
			gasPrice: envVars.CHILD_GAS_PRICE,
		},
	},
	typechain: {
		outDir: "typechain-types",
		target: "ethers-v5",
	},
	mocha: {
		reporter: process.env.CI ? "dot" : "spec",
		timeout: "1h",
	},
	etherscan: {
		apiKey: envVars.ETHERSCAN_API_KEY,
	},
	defender: {
		apiKey: envVars.DEFENDER_TEAM_API_KEY,
		apiSecret: envVars.DEFENDER_TEAM_API_SECRET_KEY,
	},
	contractSizer: {
		alphaSort: false,
		disambiguatePaths: false,
		runOnCompile: false,
		strict: true,
		except: [
			"@openzeppelin/",
			"interfaces/",
			"lib/",
			"mocks/",
			"state-transfer/",
			"tunnel/",
		],
	},
	gasReporter: {
		currency: "USD",
		enabled: envVars.REPORT_GAS,
		excludeContracts: [
			"@openzeppelin/",
			"interfaces/",
			"lib/",
			"mocks/",
			"state-transfer/",
			"tunnel/",
		],
	},
};

export default config;
