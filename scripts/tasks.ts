import { HardhatRuntimeEnvironment } from "hardhat/types";

import * as GOERLI_DEPLOYMENT_DETAILS from "../testnet-deployment-info.json";

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
