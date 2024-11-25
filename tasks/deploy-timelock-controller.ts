import { TASK_CLEAN, TASK_COMPILE } from "hardhat/builtin-tasks/task-names";
import { task, types } from "hardhat/config";
import { getSigner } from "../utils/account";
import { isLocalNetwork, Network } from "../utils/network";

interface TaskParams {
	minDelay: bigint;
	manager: string;
}

task("deploy:timelock-controller")
	.setDescription("Deploy the TimelockController contract")
	.addParam<bigint>(
		"minDelay",
		"Mininum delay (in seconds)",
		undefined,
		types.bigint
	)
	.addParam<string>(
		"manager",
		"Address of the Manager contract",
		undefined,
		types.string
	)
	.setAction(
		async (
			{ minDelay, manager: managerAddress }: TaskParams,
			{ ethers, network, run }
		) => {
			if (!ethers.isAddress(managerAddress)) {
				throw new Error("Invalid Manager address");
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
			const TimelockController = await ethers.getContractFactory(
				"contracts/TimelockController.sol:TimelockController",
				signer
			);

			const timelockController = await TimelockController.deploy(
				minDelay,
				[managerAddress],
				[managerAddress],
				managerAddress
			);
			await timelockController.waitForDeployment();

			const timelockContollerAddress =
				await timelockController.getAddress();
			console.log(
				`TimelockController deployed at ${timelockContollerAddress}`
			);
		}
	);
