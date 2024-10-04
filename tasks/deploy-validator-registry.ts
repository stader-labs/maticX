import { TASK_CLEAN, TASK_COMPILE } from "hardhat/builtin-tasks/task-names";
import { task, types } from "hardhat/config";
import { getSigner } from "../utils/account";
import { isLocalNetwork, Network } from "../utils/network";

interface TaskParams {
	stakeManager: string;
	maticToken: string;
	maticX: string;
	manager: string;
}

task("deploy:validator-registry")
	.setDescription("Deploy the ValidatorRegistry contract")
	.addParam<string>(
		"stakeManager",
		"Address of the StakeManager contract",
		undefined,
		types.string
	)
	.addParam<string>(
		"maticToken",
		"Address of the MaticToken contract",
		undefined,
		types.string
	)
	.addParam<string>(
		"maticX",
		"Address of the MaticX contract",
		undefined,
		types.string
	)
	.addParam<string>(
		"manager",
		"Address of the Manager contract",
		undefined,
		types.string
	)
	.setAction(
		async (
			{
				stakeManager: stakeManagerAddress,
				maticToken: maticTokenAddress,
				maticX: maticXAddress,
				manager: managerAddress,
			}: TaskParams,
			{ ethers, network, run, upgrades }
		) => {
			if (!ethers.utils.isAddress(stakeManagerAddress)) {
				throw new Error("Invalid StakeManager address");
			}
			if (!ethers.utils.isAddress(maticTokenAddress)) {
				throw new Error("Invalid MaticToken address");
			}
			if (!ethers.utils.isAddress(maticXAddress)) {
				throw new Error("Invalid MaticX address");
			}
			if (!ethers.utils.isAddress(managerAddress)) {
				throw new Error("Invalid Manager address");
			}

			const networkName = network.name as Network;
			console.log(`Network name: ${networkName}`);
			if (!isLocalNetwork(networkName)) {
				await run(TASK_CLEAN);
			}
			await run(TASK_COMPILE);

			const deployer = await getSigner(
				ethers,
				network.provider,
				network.config.from
			);
			const ValidatorRegistry = await ethers.getContractFactory(
				"ValidatorRegistry",
				deployer
			);

			const validatorRegistry = await upgrades.deployProxy(
				ValidatorRegistry,
				[
					stakeManagerAddress,
					maticTokenAddress,
					maticXAddress,
					managerAddress,
				],
				{ kind: "transparent" }
			);
			await validatorRegistry.deployed();

			console.log(
				`ValidatorRegistry Proxy deployed at ${validatorRegistry.address}`
			);

			const implementationAddress =
				await upgrades.erc1967.getImplementationAddress(
					validatorRegistry.address
				);
			console.log(
				`ValidatorRegistry Implementation deployed at ${implementationAddress}`
			);
		}
	);
