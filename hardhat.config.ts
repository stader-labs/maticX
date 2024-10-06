import * as dotenv from "dotenv";
import {
	HardhatNetworkHDAccountsConfig,
	HardhatNetworkMiningConfig,
} from "hardhat/types";
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
import "./tasks";
import { extractEnvironmentVariables } from "./utils/environment";
import { getProviderUrl, Network } from "./utils/network";

const isCI = process.env.CI;
dotenv.config({
	path: isCI ? ".env.example" : ".env",
});

const envVars = extractEnvironmentVariables();

const accounts: Omit<HardhatNetworkHDAccountsConfig, "accountsBalance"> = {
	mnemonic: envVars.DEPLOYER_MNEMONIC,
	passphrase: envVars.DEPLOYER_PASSPHRASE,
	path: "m/44'/60'/0'/0",
	initialIndex: 0,
	count: 10,
};

const mining: HardhatNetworkMiningConfig = {
	auto: true,
	interval: 1_000,
	mempool: {
		order: "fifo",
	},
};

const config: HardhatUserConfig = {
	networks: {
		[Network.Hardhat]: {
			initialBaseFeePerGas: 0, // See https://github.com/sc-forks/solidity-coverage/issues/652#issuecomment-896330136
			blockGasLimit: 30_000_000,
			mining,
			forking: {
				url: getProviderUrl(
					Network.Ethereum,
					envVars.API_PROVIDER,
					envVars.ETHEREUM_API_KEY
				),
				blockNumber: envVars.FORKING_BLOCK_NUMBER,
				enabled: false,
			},
		},
		[Network.Localhost]: {
			url: "http://127.0.0.1:8545",
			blockGasLimit: 30_000_000,
			mining,
		},
		[Network.Holesky]: {
			url: getProviderUrl(
				Network.Holesky,
				envVars.API_PROVIDER,
				envVars.HOLESKY_API_KEY
			),
			chainId: 17_000,
			from: envVars.DEPLOYER_ADDRESS,
			accounts,
		},
		[Network.Ethereum]: {
			url: getProviderUrl(
				Network.Ethereum,
				envVars.API_PROVIDER,
				envVars.ETHEREUM_API_KEY
			),
			chainId: 1,
			from: envVars.DEPLOYER_ADDRESS,
			accounts,
		},
	},
	defaultNetwork: Network.Hardhat,
	solidity: {
		version: "0.8.7",
		settings: {
			optimizer: {
				enabled: true,
				runs: 200,
			},
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
		apiKey: {
			[Network.Holesky]: envVars.HOLESKY_API_KEY,
			[Network.EthereumAlt]: envVars.ETHERSCAN_API_KEY,
		},
	},
	defender: {
		apiKey: envVars.OZ_DEFENDER_API_KEY,
		apiSecret: envVars.OZ_DEFENDER_API_SECRET,
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
};

export default config;
