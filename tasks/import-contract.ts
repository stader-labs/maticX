import { task, types } from "hardhat/config";
import { TASK_CLEAN, TASK_COMPILE } from "hardhat/builtin-tasks/task-names";
import { getSigner } from "../utils/account";
import { isLocalNetwork, Network } from "../utils/network";

interface TaskParams {
	name: string;
	contract: string;
}

task("import-contract")
	.setDescription("Import a contract")
	.addParam<string>("name", "Contract name", undefined, types.string)
	.addParam<string>("contract", "Contract address", undefined, types.string)
	.setAction(
		async (
			{ name: contractName, contract: contractAddress }: TaskParams,
			{ ethers, upgrades, network, run }
		) => {
			if (!ethers.isAddress(contractAddress)) {
				throw new Error("Invalid contract address");
			}

			const networkName = network.name as Network;
			console.log(`Network name: ${network.name}`);
			if (isLocalNetwork(networkName)) {
				throw new Error("Unsupported network");
			}

			await run(TASK_CLEAN);
			await run(TASK_COMPILE);

			const signer = await getSigner(
				ethers,
				network.provider,
				network.config.from
			);
			const ContractFactory = await ethers.getContractFactory(
				contractName,
				signer
			);

			await upgrades.forceImport(contractAddress, ContractFactory);
			console.log(`${contractName} imported at ${contractAddress}`);
		}
	);
