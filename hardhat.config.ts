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

const gasPrice = envVars.GAS_PRICE_GWEI || "auto";

const config: HardhatUserConfig = {
	networks: {
		[Network.Hardhat]: {
			initialBaseFeePerGas: 0, // See https://github.com/sc-forks/solidity-coverage/issues/652#issuecomment-896330136
			blockGasLimit: 30_000_000,
			mining,
			forking: {
				url: getProviderUrl(
					Network.Ethereum,
					envVars.RPC_PROVIDER,
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
		[Network.Sepolia]: {
			url: getProviderUrl(
				Network.Sepolia,
				envVars.RPC_PROVIDER,
				envVars.SEPOLIA_API_KEY
			),
			chainId: 17_000,
			from: envVars.DEPLOYER_ADDRESS,
			accounts,
			gasPrice,
		},
		[Network.Amoy]: {
			url: getProviderUrl(
				Network.Amoy,
				envVars.RPC_PROVIDER,
				envVars.AMOY_API_KEY
			),
			chainId: 80_002,
			from: envVars.DEPLOYER_ADDRESS,
			accounts,
			gasPrice,
		},
		[Network.Ethereum]: {
			url: getProviderUrl(
				Network.Ethereum,
				envVars.RPC_PROVIDER,
				envVars.ETHEREUM_API_KEY
			),
			chainId: 1,
			from: envVars.DEPLOYER_ADDRESS,
			accounts,
			gasPrice,
		},
		[Network.Polygon]: {
			url: getProviderUrl(
				Network.Polygon,
				envVars.RPC_PROVIDER,
				envVars.POLYGON_API_KEY
			),
			chainId: 137,
			from: envVars.DEPLOYER_ADDRESS,
			accounts,
			gasPrice,
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
		reporter: process.env.CI ? "dot" : "nyan",
		timeout: "1h",
	},
	etherscan: {
		apiKey: {
			[Network.Sepolia]: envVars.SEPOLIA_API_KEY,
			[Network.EthereumAlt]: envVars.ETHERSCAN_API_KEY,
		},
	},
	defender: {
		apiKey: envVars.OZ_DEFENDER_API_KEY,
		apiSecret: envVars.OZ_DEFENDER_API_SECRET,
	},
	gasReporter: {
		coinmarketcap: envVars.COINMARKETCAP_API_KEY,
		excludeContracts: [
			"@openzeppelin/",
			"interfaces/",
			"lib/",
			"mocks/",
			"state-transfer/",
			"tunnel/",
		],
		enabled: envVars.REPORT_GAS,
		...(envVars.GAS_REPORTER_NETWORK === "polygon"
			? {
					currency: "POL",
					token: "POL",
					gasPriceApi:
						"https://api.polygonscan.com/api?module=proxy&action=eth_gasPrice",
				}
			: {
					currency: "ETH",
					token: "ETH",
					gasPriceApi:
						"https://api.etherscan.io/api?module=proxy&action=eth_gasPrice",
				}),
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
		only: ["ChildPool", "MaticX", "ValidatorRegistry"],
	},
};

export default config;
