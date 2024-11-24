import { subtask, task, types } from "hardhat/config";
import { isLocalNetwork, Network } from "../utils/network";
import { ChildPool, FxStateChildTunnel, MaticX } from "../typechain-types";

interface TaskParams {
	childPool: string;
	maticX: string;
	fxStateRootTunnel: string;
	fxStateChildTunnel: string;
	stakeManager: string;
	checkpointManager: string;
	fxChild: string;
	matic: string;
	manager: string;
	treasury: string;
	instantPoolOwner: string;
	deployer: string;
}

type AccessControlledContract = ChildPool | FxStateChildTunnel | MaticX;

task("validate-child-deployment")
	.setDescription("Validate child deployment")
	.addParam<string>(
		"childPool",
		"ChildPool contract address",
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
		"fxStateChildTunnel",
		"FxStateChildTunnel contract address",
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
		"fxChild",
		"FxRoot contract address",
		undefined,
		types.string
	)
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
		"instantPoolOwner",
		"InstantPoolOwner contract address",
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
				childPool: childPoolAddress,
				maticX: maticXAddress,
				fxStateChildTunnel: fxStateChildTunnelAddress,
				fxStateRootTunnel: fxStateRootTunnelAddress,
				fxChild: fxChildAddress,
				manager: managerAddress,
				treasury: treasuryAddress,
				instantPoolOwner: instantPoolOwnerAddress,
				deployer: deployerAddress,
			}: TaskParams,
			{ ethers, network, run }
		) => {
			if (!ethers.isAddress(childPoolAddress)) {
				throw new Error("Invalid ChildPool address");
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
			if (!ethers.isAddress(fxChildAddress)) {
				throw new Error("Invalid FxRoot address");
			}
			if (!ethers.isAddress(managerAddress)) {
				throw new Error("Invalid Manager address");
			}
			if (!ethers.isAddress(treasuryAddress)) {
				throw new Error("Invalid Treasury address");
			}
			if (!ethers.isAddress(instantPoolOwnerAddress)) {
				throw new Error("Invalid InstantPoolOwner address");
			}
			if (!ethers.isAddress(deployerAddress)) {
				throw new Error("Invalid Deployer address");
			}

			const networkName = network.name as Network;
			console.log(`Network name: ${networkName}`);
			if (isLocalNetwork(networkName)) {
				throw new Error("Unsupported network");
			}

			await run("validate-child-deployment:child-pool", {
				childPoolAddress,
				maticXAddress,
				fxStateChildTunnelAddress,
				managerAddress,
				treasuryAddress,
				instantPoolOwnerAddress,
			});

			await run("validate-child-deployment:matic-x", {
				maticXAddress,
				childPoolAddress,
				fxStateRootTunnelAddress,
				managerAddress,
				treasuryAddress,
			});

			await run("validate-child-deployment:fx-state-child-tunnel", {
				fxStateRootTunnelAddress,
				maticXAddress,
				fxStateChildTunnelAddress,
				fxChildAddress,
				deployerAddress,
			});
		}
	);

subtask("validate-child-deployment:child-pool")
	.setDescription("Validate ChildPool deployment")
	.addParam<string>("childPoolAddress")
	.addParam<string>("maticXAddress")
	.addParam<string>("fxStateChildTunnelAddress")
	.addParam<string>("managerAddress")
	.addParam<string>("treasuryAddress")
	.addParam<string>("instantPoolOwnerAddress")
	.setAction(
		async (
			{
				childPoolAddress,
				maticXAddress,
				fxStateChildTunnelAddress,
				managerAddress,
				treasuryAddress,
				instantPoolOwnerAddress,
			},
			{ ethers }
		) => {
			console.log("ChildPool validation started");
			const childPool = await ethers.getContractAt(
				"ChildPool",
				childPoolAddress
			);

			await validateAccessControl(
				childPool,
				"ChildPool",
				childPoolAddress,
				managerAddress
			);

			const [
				currentFxStateChildTunnelAddress,
				currentMaticXAddress,
				currentTrustedForwarder,
			] = await childPool.getContracts();
			if (
				currentFxStateChildTunnelAddress !== fxStateChildTunnelAddress
			) {
				throw new Error(
					`Call setFxStateChildTunnel(${fxStateChildTunnelAddress}) on ChildPool(${childPoolAddress}) contract`
				);
			}
			if (currentMaticXAddress !== maticXAddress) {
				throw new Error(
					`Invalid MaticX contract. Redeploy ChildPool(${childPoolAddress}) contract`
				);
			}
			if (currentTrustedForwarder !== ethers.ZeroAddress) {
				throw new Error(
					`Call setTrustedForwarder(${ethers.ZeroAddress}) on ChildPool(${childPoolAddress}) contract`
				);
			}

			const currentTreasuryAddress = await childPool.treasury();
			if (currentTreasuryAddress !== treasuryAddress) {
				throw new Error(
					`Call setTreasury(${treasuryAddress}) on ChildPool(${childPoolAddress}) contract`
				);
			}

			const currentInstantPoolOwnerAddress =
				await childPool.instantPoolOwner();
			if (currentInstantPoolOwnerAddress !== instantPoolOwnerAddress) {
				throw new Error(
					`Call setInstantPoolOwner(${instantPoolOwnerAddress}) on ChildPool(${childPoolAddress}) contract`
				);
			}

			console.log("ChildPool validation finished\n");
		}
	);

subtask("validate-child-deployment:matic-x")
	.setDescription("Validate MaticX deployment")
	.addParam<string>("maticXAddress")
	.setAction(async ({ maticXAddress }, { ethers }) => {
		console.log("MaticX validation started");
		const maticX = await ethers.getContractAt("MaticX", maticXAddress);

		const currentName = await maticX.name();
		if (currentName !== "Liquid Staking Matic (PoS)") {
			throw new Error(
				`Invalid name. Redeploy MaticX(${maticXAddress}) contract`
			);
		}

		const currentSymbol = await maticX.symbol();
		if (currentSymbol !== "MaticX") {
			throw new Error(
				`Invalid symbol. Redeploy MaticX(${maticXAddress}) contract`
			);
		}

		console.log("MaticX validation finished\n");
	});

subtask("validate-child-deployment:fx-state-child-tunnel")
	.setDescription("Validate FxStateChildTunnel deployment")
	.addParam<string>("fxStateChildTunnelAddress")
	.addParam<string>("fxStateRootTunnelAddress")
	.addParam<string>("fxChildAddress")
	.addParam<string>("deployerAddress")
	.setAction(
		async (
			{
				fxStateChildTunnelAddress,
				fxStateRootTunnelAddress,
				fxChildAddress,
				deployerAddress,
			},
			{ ethers }
		) => {
			console.log("FxStateChildTunnel validation started");
			const fxStateChildTunnel = await ethers.getContractAt(
				"FxStateChildTunnel",
				fxStateChildTunnelAddress
			);

			await validateAccessControl(
				fxStateChildTunnel,
				"FxStateChildTunnel",
				fxStateChildTunnelAddress,
				deployerAddress
			);

			const currentFxChildAddress = await fxStateChildTunnel.fxChild();
			if (currentFxChildAddress !== fxChildAddress) {
				throw new Error(
					`Invalid FxChild contract. Redeploy FxStateChidTunnel(${fxStateChildTunnelAddress}) contract`
				);
			}

			const currentFxStateRootTunnelAddress =
				await fxStateChildTunnel.fxRootTunnel();
			if (currentFxStateRootTunnelAddress !== fxStateRootTunnelAddress) {
				throw new Error(
					`Call setFxRootTunnel(${fxStateRootTunnelAddress}) on FxStateChildTunnel(${fxStateChildTunnelAddress}) contract`
				);
			}

			console.log("FxStateChildTunnel validation finished\n");
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
