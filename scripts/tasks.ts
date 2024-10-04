import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as GOERLI_DEPLOYMENT_DETAILS from "../testnet-deployment-info.json";
import { extractEnvironmentVariables } from "../utils/environment";

const envVars = extractEnvironmentVariables();

const verifyContract = async (
	hre: HardhatRuntimeEnvironment,
	contractAddress: string
) => {
	await hre.run("verify:verify", {
		address: contractAddress,
	});
};

export const verify = async (hre: HardhatRuntimeEnvironment) => {
	const contracts = [
		GOERLI_DEPLOYMENT_DETAILS.maticX_impl,
		GOERLI_DEPLOYMENT_DETAILS.validator_registry_impl,
	];

	for (const contract of contracts) {
		try {
			await verifyContract(hre, contract);
		} catch (error) {
			console.log(error);
		}
	}
};

export async function deployDirect(
	hre: HardhatRuntimeEnvironment,
	contractName: string,
	...args: unknown[]
) {
	const Contract = await hre.ethers.getContractFactory(contractName);

	console.log(`Deploying ${contractName}: ${args}, ${args.length}`);
	const contract = args.length
		? await Contract.deploy(...args)
		: await Contract.deploy();

	await contract.deployed();

	console.log(`${contractName} deployed to:`, contract.address);
}

export async function deployProxy(
	hre: HardhatRuntimeEnvironment,
	contractName: string,
	...args: unknown[]
) {
	const Contract = await hre.ethers.getContractFactory(contractName);

	console.log(`Deploying proxy ${contractName}: ${args}, ${args.length}`);
	const contract = args.length
		? await hre.upgrades.deployProxy(Contract, args)
		: await hre.upgrades.deployProxy(Contract);

	await contract.deployed();

	console.log(`Proxy ${contractName} deployed to:`, contract.address);
}

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
