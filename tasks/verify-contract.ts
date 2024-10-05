import { task, types } from "hardhat/config";
import { TASK_CLEAN, TASK_COMPILE } from "hardhat/builtin-tasks/task-names";
import { isLocalNetwork, Network } from "../utils/network";

interface TaskParams {
	address: string;
	contractPath: string;
	constructorArguments: string[];
}

task("verify-contract")
	.setDescription("Verify a contract")
	.addParam<string>("address", "Contract address", undefined, types.string)
	.addOptionalParam<string>(
		"contractPath",
		"Contract path",
		undefined,
		types.string
	)
	.addOptionalVariadicPositionalParam<string[]>(
		"constructorArguments",
		"Constructor arguments",
		[],
		types.string
	)
	.setAction(
		async (
			{
				address: contractAddress,
				contractPath,
				constructorArguments,
			}: TaskParams,
			{ ethers, network, run }
		) => {
			if (!ethers.utils.isAddress(contractAddress)) {
				throw new Error("Invalid contract address");
			}

			const networkName = network.name as Network;
			console.log(`Network name: ${networkName}`);
			if (isLocalNetwork(networkName)) {
				throw new Error("Unsupported network");
			}

			await run(TASK_CLEAN);
			await run(TASK_COMPILE);

			await run("verify:verify", {
				address: contractAddress,
				contract: contractPath,
				constructorArguments,
				force: true,
			});
		}
	);
