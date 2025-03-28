import * as fs from "node:fs";
import path from "node:path";
import { Contract, Wallet } from "ethers";
import { ethers, network, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { predictContractAddress } from "./utils";
import { ValidatorRegistry, MaticX } from "../typechain-types";
import { extractEnvironmentVariables } from "../utils/environment";

interface DeploymentData {
	Network: string;
	Signer: string;
	MaticX: string;
	ValidatorRegistry: string;
}

type ContractNames =
	| "ProxyAdmin"
	| "ValidatorRegistryImplementation"
	| "ValidatorRegistry"
	| "MaticXImplementation"
	| "MaticX";

type DeploymentOrder = Record<ContractNames, number>;

const envVars = extractEnvironmentVariables();

const deploymentOrder: DeploymentOrder = {
	ProxyAdmin: 0,
	ValidatorRegistryImplementation: 1,
	ValidatorRegistry: 2,
	MaticXImplementation: 3,
	MaticX: 4,
};

interface Exportable {
	data: Record<string, string>;
	export(): void;
}

interface Deployable {
	deploy(): void;
}

class BlockchainDeployer {
	signer: Wallet | SignerWithAddress;
	nonce: number;

	constructor(signer: Wallet | SignerWithAddress, nonce: number) {
		this.signer = signer;
		this.nonce = nonce;
	}

	deployContract = async <T extends Contract>(
		contractName: keyof DeploymentData,
		...args: unknown[]
	) => {
		console.log(`Deploying ${contractName}: ${args}, ${args.length}`);
		const Contract = await ethers.getContractFactory(
			contractName,
			this.signer
		);
		const contract = args.length
			? ((await Contract.deploy(...args)) as T)
			: ((await Contract.deploy()) as T);
		await contract.waitForDeployment();
		console.log(`Deployed at ${contract.address}`);

		return contract;
	};

	deployProxy = async <T extends Contract>(
		contractName: keyof DeploymentData,
		...args: unknown[]
	) => {
		console.log(`Deploying ${contractName}: ${args}, ${args.length}`);
		const Contract = await ethers.getContractFactory(
			contractName,
			this.signer
		);
		const contract = args.length
			? ((await upgrades.deployProxy(Contract, args)) as T)
			: ((await upgrades.deployProxy(Contract)) as T);
		await contract.waitForDeployment();
		console.log(`Deployed at ${contract.address}`);

		return contract;
	};
}

abstract class MultichainDeployer {
	rootDeployer: BlockchainDeployer;

	constructor(rootDeployer: BlockchainDeployer) {
		this.rootDeployer = rootDeployer;
	}
}

export class MaticXDeployer
	extends MultichainDeployer
	implements Exportable, Deployable
{
	data: Partial<Record<ContractNames, string>> = {};

	public static CreateMaticXDeployer = async (
		rootSigner: Wallet | SignerWithAddress
	) => {
		const rootNonce = await rootSigner.getTransactionCount();
		const rootDeployer = new BlockchainDeployer(rootSigner, rootNonce);
		const maticXDeployer = new MaticXDeployer(rootDeployer);

		maticXDeployer.predictAddresses();

		return maticXDeployer;
	};

	deploy = async () => {
		await this.deployValidatorRegistry();
		await this.deployMaticX();
	};

	private deployValidatorRegistry = async () => {
		return this.rootDeployer.deployProxy<ValidatorRegistry>(
			"ValidatorRegistry",
			envVars.STAKE_MANAGER,
			envVars.MATIC_TOKEN,
			this.data.MaticX,
			envVars.MANAGER
		);
	};

	private deployMaticX = async () => {
		return this.rootDeployer.deployProxy<MaticX>(
			"MaticX",
			this.data.ValidatorRegistry,
			envVars.STAKE_MANAGER,
			envVars.MATIC_TOKEN,
			envVars.MANAGER,
			envVars.TREASURY
		);
	};

	export = async () => {
		const fileName = path.join(
			__dirname,
			"../",
			`${network.name}-deployment-info.json`
		);
		const chainId = await this.rootDeployer.signer.getChainId();
		const out = {
			network: chainId,
			multisig_upgrader: { address: "0x", owners: [] },
			root_deployer: this.rootDeployer.signer.address,
			manager: envVars.MANAGER,
			treasury: envVars.TREASURY,
			matic_erc20_address: envVars.MATIC_TOKEN,
			matic_stake_manager_proxy: envVars.STAKE_MANAGER,
			proxy_admin: this.data.ProxyAdmin,
			maticX_proxy: this.data.MaticX,
			maticX_impl: this.data.MaticXImplementation,
			validator_registry_proxy: this.data.ValidatorRegistry,
			validator_registry_impl: this.data.ValidatorRegistryImplementation,
		};
		fs.writeFileSync(fileName, JSON.stringify(out));
	};

	private predictAddresses = () => {
		this.calculateRootContractAddresses();
	};

	private calculateRootContractAddresses = () => {
		(Object.keys(deploymentOrder) as ContractNames[]).forEach((k) => {
			this.data[k] = predictContractAddress(
				this.rootDeployer.signer.address,
				this.rootDeployer.nonce + deploymentOrder[k]
			);
		});
	};
}
