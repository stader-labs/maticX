import * as dotenv from "dotenv";
import {
	HardhatNetworkMiningConfig,
	HardhatRuntimeEnvironment,
} from "hardhat/types";
import { HardhatUserConfig, task } from "hardhat/config";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-solhint";
import "@openzeppelin/hardhat-upgrades";
import "@nomiclabs/hardhat-etherscan";
import "@openzeppelin/hardhat-defender";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "solidity-coverage";
import { deployDirect, deployProxy, verify } from "./scripts/tasks";
import { extractEnvironmentVariables } from "./utils/environment";

const envSuffix = process.env.NODE_ENV === "main" ? "" : ".test";
const exampleSuffix = process.env.CI ? ".example" : "";

dotenv.config({
	path: `.env${envSuffix}${exampleSuffix}`,
});

const envVars = extractEnvironmentVariables();

task("verifyMaticX", "MaticX contracts verification").setAction(
	async (args, hre: HardhatRuntimeEnvironment) => {
		await verify(hre);
	}
);

task("deployFxStateChildTunnel", "Deploy FxStateChildTunnel").setAction(
	async (args, hre: HardhatRuntimeEnvironment) => {
		if (!isChildNetwork(hre.network.name)) {
			return;
		}
		await deployDirect(hre, "FxStateChildTunnel", envVars.FX_CHILD);
	}
);

task("deployFxStateRootTunnel", "Deploy FxStateRootTunnel")
	.addPositionalParam("maticX")
	.setAction(async ({ maticX }, hre: HardhatRuntimeEnvironment) => {
		if (!isRootNetwork(hre.network.name)) {
			return;
		}
		await deployDirect(
			hre,
			"FxStateRootTunnel",
			envVars.CHECKPOINT_MANAGER,
			envVars.FX_ROOT,
			maticX
		);
	});

task("deployRateProvider", "Deploy RateProvider")
	.addPositionalParam("fxStateChildTunnel")
	.setAction(
		async ({ fxStateChildTunnel }, hre: HardhatRuntimeEnvironment) => {
			if (!isChildNetwork(hre.network.name)) {
				return;
			}
			await deployDirect(hre, "RateProvider", fxStateChildTunnel);
		}
	);

task("deployMaticXImpl", "Deploy MaticX Implementation only").setAction(
	async (args, hre: HardhatRuntimeEnvironment) => {
		if (!isRootNetwork(hre.network.name)) {
			return;
		}
		await deployDirect(hre, "MaticX");
	}
);

task(
	"deployValidatorRegistryImpl",
	"Deploy ValidatorRegistry Implementation only"
).setAction(async (args, hre: HardhatRuntimeEnvironment) => {
	if (!isRootNetwork(hre.network.name)) return;
	await deployDirect(hre, "ValidatorRegistry");
});

task("deployChildPoolProxy", "Deploy ChildPool Proxy only")
	.addPositionalParam("fxStateChildTunnel")
	.addPositionalParam("maticX")
	.addPositionalParam("manager")
	.addPositionalParam("instantPoolOwner")
	.addPositionalParam("treasury")
	.addPositionalParam("instantWithdrawalFeeBps")
	.setAction(
		async (
			{
				fxStateChildTunnel,
				maticX,
				manager,
				instantPoolOwner,
				treasury,
				instantWithdrawalFeeBps,
			},
			hre: HardhatRuntimeEnvironment
		) => {
			if (!isChildNetwork(hre.network.name)) return;
			await deployProxy(
				hre,
				"ChildPool",
				fxStateChildTunnel,
				maticX,
				manager,
				instantPoolOwner,
				treasury,
				instantWithdrawalFeeBps
			);
		}
	);

task("deployChildPoolImpl", "Deploy ChildPool Implementation only").setAction(
	async (args, hre: HardhatRuntimeEnvironment) => {
		if (!isChildNetwork(hre.network.name)) {
			return;
		}
		await deployDirect(hre, "ChildPool");
	}
);

function isChildNetwork(selected: string) {
	const expected = "matic";
	return _isCorrectNetwork(expected, selected);
}

function isRootNetwork(selected: string) {
	const expected = "mainnet";
	return _isCorrectNetwork(expected, selected);
}

function _isCorrectNetwork(expected: string, selected: string) {
	if (selected === expected) {
		return true;
	}

	console.log(
		`Wrong network configuration! Expected: ${expected} Selected: ${selected}`
	);
}

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
		outDir: "typechain",
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
			"state-transfer",
			"tunnel",
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
			"state-transfer",
			"tunnel",
		],
	},
};

export default config;
