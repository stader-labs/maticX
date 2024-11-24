import { subtask, task, types } from "hardhat/config";
import { isLocalNetwork, Network } from "../utils/network";
import {
	FxStateRootTunnel,
	MaticX,
	ValidatorRegistry,
} from "../typechain-types";

interface TaskParams {
	validatorRegistry: string;
	maticX: string;
	fxStateRootTunnel: string;
	fxStateChildTunnel: string;
	stakeManager: string;
	checkpointManager: string;
	fxRoot: string;
	matic: string;
	pol: string;
	manager: string;
	treasury: string;
	deployer: string;
}

type AccessControlledContract = FxStateRootTunnel | MaticX | ValidatorRegistry;

task("validate-parent-deployment")
	.setDescription("Validate deployment")
	.addParam<string>(
		"validatorRegistry",
		"ValidatorRegistry contract address",
		undefined,
		types.string
	)
	.addParam<string>(
		"maticX",
		"MaticX contract address",
		undefined,
		types.string
	)
	.addParam<string>(
		"fxStateRootTunnel",
		"FxStateRootTunnel contract address",
		undefined,
		types.string
	)
	.addParam<string>(
		"fxStateChildTunnel",
		"FxStateChildTunnel contract address",
		undefined,
		types.string
	)
	.addParam<string>(
		"stakeManager",
		"StakeManager contract address",
		undefined,
		types.string
	)
	.addParam<string>(
		"checkpointManager",
		"CheckpointManager contract address",
		undefined,
		types.string
	)
	.addParam<string>(
		"fxRoot",
		"FxRoot contract address",
		undefined,
		types.string
	)
	.addParam<string>(
		"matic",
		"Matic contract address",
		undefined,
		types.string
	)
	.addParam<string>("pol", "POL contract address", undefined, types.string)
	.addParam<string>(
		"manager",
		"Manager contract address",
		undefined,
		types.string
	)
	.addParam<string>(
		"treasury",
		"Treasury contract address",
		undefined,
		types.string
	)
	.addParam<string>(
		"deployer",
		"Deployer contract address",
		undefined,
		types.string
	)
	.setAction(
		async (
			{
				validatorRegistry: validatorRegistryAddress,
				maticX: maticXAddress,
				fxStateRootTunnel: fxStateRootTunnelAddress,
				fxStateChildTunnel: fxStateChildTunnelAddress,
				stakeManager: stakeManagerAddress,
				checkpointManager: checkpointManagerAddress,
				fxRoot: fxRootAddress,
				matic: maticAddress,
				pol: polAddress,
				manager: managerAddress,
				treasury: treasuryAddress,
				deployer: deployerAddress,
			}: TaskParams,
			{ ethers, network, run }
		) => {
			if (!ethers.isAddress(validatorRegistryAddress)) {
				throw new Error("Invalid ValidatorRegistry address");
			}
			if (!ethers.isAddress(maticXAddress)) {
				throw new Error("Invalid MaticX address");
			}
			if (!ethers.isAddress(fxStateRootTunnelAddress)) {
				throw new Error("Invalid FxStateRootTunnel address");
			}
			if (!ethers.isAddress(fxStateChildTunnelAddress)) {
				throw new Error("Invalid FxStateChildTunnel address");
			}
			if (!ethers.isAddress(stakeManagerAddress)) {
				throw new Error("Invalid StakeManager address");
			}
			if (!ethers.isAddress(checkpointManagerAddress)) {
				throw new Error("Invalid CheckpointManager address");
			}
			if (!ethers.isAddress(fxRootAddress)) {
				throw new Error("Invalid FxRoot address");
			}
			if (!ethers.isAddress(maticAddress)) {
				throw new Error("Invalid Matic address");
			}
			if (!ethers.isAddress(polAddress)) {
				throw new Error("Invalid POL address");
			}
			if (!ethers.isAddress(managerAddress)) {
				throw new Error("Invalid Manager address");
			}
			if (!ethers.isAddress(treasuryAddress)) {
				throw new Error("Invalid Treasury address");
			}
			if (!ethers.isAddress(deployerAddress)) {
				throw new Error("Invalid Deployer address");
			}

			const networkName = network.name as Network;
			console.log(`Network name: ${networkName}`);
			if (isLocalNetwork(networkName)) {
				throw new Error("Unsupported network");
			}

			await run("validate-parent-deployment:validator-registry", {
				validatorRegistryAddress,
				maticXAddress,
				stakeManagerAddress,
				maticAddress,
				polAddress,
				managerAddress,
			});

			await run("validate-parent-deployment:matic-x", {
				maticXAddress,
				validatorRegistryAddress,
				fxStateRootTunnelAddress,
				stakeManagerAddress,
				maticAddress,
				polAddress,
				managerAddress,
				treasuryAddress,
			});

			await run("validate-parent-deployment:fx-state-root-tunnel", {
				fxStateRootTunnelAddress,
				maticXAddress,
				fxStateChildTunnelAddress,
				checkpointManagerAddress,
				fxRootAddress,
				deployerAddress,
			});
		}
	);

subtask("validate-parent-deployment:validator-registry")
	.setDescription("Validate ValidatorRegistry deployment")
	.addParam<string>("validatorRegistryAddress")
	.addParam<string>("maticXAddress")
	.addParam<string>("stakeManagerAddress")
	.addParam<string>("maticAddress")
	.addParam<string>("polAddress")
	.addParam<string>("managerAddress")
	.setAction(
		async (
			{
				validatorRegistryAddress,
				maticXAddress,
				stakeManagerAddress,
				maticAddress,
				polAddress,
				managerAddress,
			},
			{ ethers }
		) => {
			console.log("ValidatorRegistry validation started");
			const validatorRegistry = await ethers.getContractAt(
				"ValidatorRegistry",
				validatorRegistryAddress
			);

			await validateAccessControl(
				validatorRegistry,
				"ValidatorRegistry",
				validatorRegistryAddress,
				managerAddress
			);

			const [
				currentStakeManagerAddress,
				currentMaticAddress,
				currentMaticXAddress,
				currentPOLAdddress,
			] = await validatorRegistry.getContracts();
			if (currentStakeManagerAddress !== stakeManagerAddress) {
				throw new Error(
					`Invalid StakeManager contract. Redeploy ValidatorRegistry(${validatorRegistryAddress}) contract`
				);
			}
			if (currentMaticXAddress !== maticXAddress) {
				throw new Error(
					`Call setMaticX(${maticXAddress}) on ValidatorRegistry(${validatorRegistryAddress}) contract`
				);
			}
			if (currentMaticAddress !== maticAddress) {
				throw new Error(
					`Invalid Matic contract. Redeploy ValidatorRegistry(${validatorRegistryAddress}) contract`
				);
			}
			if (currentPOLAdddress !== polAddress) {
				throw new Error(
					`Invalid POL contract. Redeploy ValidatorRegistry(${validatorRegistryAddress}) contract`
				);
			}

			console.log("ValidatorRegistry validation finished\n");
		}
	);

subtask("validate-parent-deployment:matic-x")
	.setDescription("Validate MaticX deployment")
	.addParam<string>("maticXAddress")
	.addParam<string>("validatorRegistryAddress")
	.addParam<string>("fxStateRootTunnelAddress")
	.addParam<string>("stakeManagerAddress")
	.addParam<string>("maticAddress")
	.addParam<string>("polAddress")
	.addParam<string>("managerAddress")
	.addParam<string>("treasuryAddress")
	.setAction(
		async (
			{
				maticXAddress,
				validatorRegistryAddress,
				fxStateRootTunnelAddress,
				stakeManagerAddress,
				maticAddress,
				polAddress,
				managerAddress,
				treasuryAddress,
			},
			{ ethers }
		) => {
			console.log("MaticX validation started");
			const maticX = await ethers.getContractAt("MaticX", maticXAddress);

			await validateAccessControl(
				maticX,
				"MaticX",
				maticXAddress,
				managerAddress
			);

			const [
				currentStakeManagerAddress,
				currentMaticAddress,
				currentValidatorRegistryAddress,
				currentPOLAdddress,
			] = await maticX.getContracts();
			if (currentStakeManagerAddress !== stakeManagerAddress) {
				throw new Error(
					`Invalid StakeManager contract. Redeploy MaticX(${maticXAddress}) contract`
				);
			}
			if (currentValidatorRegistryAddress !== validatorRegistryAddress) {
				throw new Error(
					`Call setValidatorRegistry(${validatorRegistryAddress}) on MaticX(${maticXAddress}) contract`
				);
			}
			if (currentMaticAddress !== maticAddress) {
				throw new Error(
					`Invalid Matic contract. Redeploy MaticX(${maticXAddress}) contract`
				);
			}
			if (currentPOLAdddress !== polAddress) {
				throw new Error(
					`Invalid POL contract. Redeploy MaticX(${maticXAddress}) contract`
				);
			}

			const currentFxStateRootTunnelAddress =
				await maticX.fxStateRootTunnel();
			if (currentFxStateRootTunnelAddress !== fxStateRootTunnelAddress) {
				throw new Error(
					`Call setFxStateRootTunnel(${fxStateRootTunnelAddress}) on MaticX(${maticXAddress})`
				);
			}

			const currentTreasuryAddress = await maticX.treasury();
			if (currentTreasuryAddress !== treasuryAddress) {
				throw new Error(
					`Call setTreasury(${treasuryAddress}) on MaticX(${maticXAddress})`
				);
			}

			console.log("MaticX validation finished\n");
		}
	);

subtask("validate-parent-deployment:fx-state-root-tunnel")
	.setDescription("Validate FxStateRootTunnel deployment")
	.addParam<string>("fxStateRootTunnelAddress")
	.addParam<string>("maticXAddress")
	.addParam<string>("fxStateChildTunnelAddress")
	.addParam<string>("checkpointManagerAddress")
	.addParam<string>("fxRootAddress")
	.addParam<string>("deployerAddress")
	.setAction(
		async (
			{
				fxStateRootTunnelAddress,
				maticXAddress,
				fxStateChildTunnelAddress,
				checkpointManagerAddress,
				fxRootAddress,
				deployerAddress,
			},
			{ ethers }
		) => {
			console.log("FxStateRootTunnel validation started");
			const fxStateRootTunnel = await ethers.getContractAt(
				"FxStateRootTunnel",
				fxStateRootTunnelAddress
			);

			await validateAccessControl(
				fxStateRootTunnel,
				"FxStateRootTunnel",
				fxStateRootTunnelAddress,
				deployerAddress
			);

			const currentCheckpointManagerAddress =
				await fxStateRootTunnel.checkpointManager();
			if (currentCheckpointManagerAddress !== checkpointManagerAddress) {
				throw new Error(
					`Invalid CheckpointManager contract. Redeploy FxStateRootTunnel(${fxStateRootTunnelAddress}) contract`
				);
			}

			const currentFxRootAddress = await fxStateRootTunnel.fxRoot();
			if (currentFxRootAddress !== fxRootAddress) {
				throw new Error(
					`Invalid FxRoot contract. Redeploy FxStateRootTunnel(${fxStateRootTunnelAddress}) contract`
				);
			}

			const currentMaticXAddress = await fxStateRootTunnel.maticX();
			if (currentMaticXAddress !== maticXAddress) {
				throw new Error(
					`Call setMaticX(${maticXAddress}) on FxStateRootTunnel(${fxStateRootTunnelAddress}) contract`
				);
			}

			const currentFxStateChildTunnelAddress =
				await fxStateRootTunnel.fxChildTunnel();
			if (
				currentFxStateChildTunnelAddress !== fxStateChildTunnelAddress
			) {
				throw new Error(
					`Call setFxChildTunnel(${fxStateChildTunnelAddress}) on FxStateRootTunnel(${fxStateRootTunnelAddress}) contract`
				);
			}

			console.log("FxStateRootTunnel validation finished\n");
		}
	);

async function validateAccessControl(
	contract: AccessControlledContract,
	contractName: string,
	contractAddress: string,
	defaultAdminAddress: string
) {
	const defaultAdminRole = await contract.DEFAULT_ADMIN_ROLE();
	const hasRole = await contract.hasRole(
		defaultAdminRole,
		defaultAdminAddress
	);
	if (!hasRole) {
		throw new Error(
			`Call grantRole(${defaultAdminRole} ${defaultAdminAddress}) on ${contractName}(${contractAddress})`
		);
	}
}
