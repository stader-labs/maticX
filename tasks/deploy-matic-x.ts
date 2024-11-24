import { TASK_CLEAN, TASK_COMPILE } from "hardhat/builtin-tasks/task-names";
import { task, types } from "hardhat/config";
import { getSigner } from "../utils/account";
import { isLocalNetwork, Network } from "../utils/network";

interface TaskParams {
	validatorRegistry: string;
	stakeManager: string;
	matic: string;
	manager: string;
	treasury: string;
}

task("deploy:matic-x")
	.setDescription("Deploy the MaticX contract")
	.addParam<string>(
		"validatorRegistry",
		"Address of the ValidatorRegistry contract",
		undefined,
		types.string
	)
	.addParam<string>(
		"stakeManager",
		"Address of the StakeManager contract",
		undefined,
		types.string
	)
	.addParam<string>(
		"matic",
		"Address of the Matic contract",
		undefined,
		types.string
	)
	.addParam<string>(
		"manager",
		"Address of the Manager contract",
		undefined,
		types.string
	)
	.addParam<string>(
		"treasury",
		"Address of the Treasury contract",
		undefined,
		types.string
	)
	.setAction(
		async (
			{
				validatorRegistry: validatorRegistryAddress,
				stakeManager: stakeManagerAddress,
				matic: maticAddress,
				manager: managerAddress,
				treasury: treasuryAddress,
			}: TaskParams,
			{ ethers, network, run, upgrades }
		) => {
			if (!ethers.isAddress(validatorRegistryAddress)) {
				throw new Error("Invalid ValidatorRegistry address");
			}
			if (!ethers.isAddress(stakeManagerAddress)) {
				throw new Error("Invalid StakeManager address");
			}
			if (!ethers.isAddress(maticAddress)) {
				throw new Error("Invalid Matic address");
			}
			if (!ethers.isAddress(managerAddress)) {
				throw new Error("Invalid Manager address");
			}
			if (!ethers.isAddress(treasuryAddress)) {
				throw new Error("Invalid Treasury address");
			}

			const networkName = network.name as Network;
			console.log(`Network name: ${networkName}`);
			if (!isLocalNetwork(networkName)) {
				await run(TASK_CLEAN);
			}
			await run(TASK_COMPILE);

			const signer = await getSigner(
				ethers,
				network.provider,
				network.config.from
			);
			const MaticX = await ethers.getContractFactory("MaticX", signer);

			const maticX = await upgrades.deployProxy(
				MaticX,
				[
					validatorRegistryAddress,
					stakeManagerAddress,
					maticAddress,
					managerAddress,
					treasuryAddress,
				],
				{ kind: "transparent" }
			);
			await maticX.waitForDeployment();

			const maticXAddress = await maticX.getAddress();
			console.log(`MaticX Proxy deployed at ${maticXAddress}`);

			const implementationAddress =
				await upgrades.erc1967.getImplementationAddress(maticXAddress);
			console.log(
				`MaticX Implementation deployed at ${implementationAddress}`
			);
			const proxyAdminAddress =
				await upgrades.erc1967.getAdminAddress(maticXAddress);
			console.log(`MaticX ProxyAdmin deployed at ${proxyAdminAddress}`);
		}
	);
