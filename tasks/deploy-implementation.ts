import { task, types } from "hardhat/config";
import { TASK_CLEAN, TASK_COMPILE } from "hardhat/builtin-tasks/task-names";
import { getSigner } from "../utils/account";
import { isLocalNetwork, Network } from "../utils/network";

interface TaskParams {
	name: string;
}

task("deploy-implementation")
	.setDescription("Deploy a contract implementation")
	.addParam<string>("name", "Contract name", undefined, types.string)
	.setAction(
		async (
			{ name: contractName }: TaskParams,
			{ ethers, upgrades, network, run }
		) => {
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
			const adjustedContractName = isLocalNetwork(networkName)
				? `${contractName}Mock`
				: contractName;
			const ContractFactory = await ethers.getContractFactory(
				adjustedContractName,
				signer
			);

			const implementationAddress = await upgrades.deployImplementation(
				ContractFactory,
				{
					kind: "transparent",
					verifySourceCode: true,
				}
			);
			console.log(
				`${contractName} Implementation deployed at ${implementationAddress}`
			);
		}
	);
