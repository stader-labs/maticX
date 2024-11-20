import { TASK_CLEAN, TASK_COMPILE } from "hardhat/builtin-tasks/task-names";
import { task, types } from "hardhat/config";
import { getSigner } from "../utils/account";
import { isLocalNetwork, Network } from "../utils/network";

interface TaskParams {
	name: string;
	contract: string;
	unsafe: boolean;
}

task("upgrade-contract")
	.setDescription("Upgrade a contract")
	.addParam<string>("name", "Contract name", undefined, types.string)
	.addParam<string>("contract", "Contract address", undefined, types.string)
	.addOptionalParam<boolean>(
		"unsafe",
		"Is unsafe upgrade",
		false,
		types.boolean
	)
	.setAction(
		async (
			{
				name: contractName,
				contract: contractAddress,
				unsafe,
			}: TaskParams,
			{ ethers, upgrades, network, run }
		) => {
			if (!ethers.isAddress(contractAddress)) {
				throw new Error("Invalid contract address");
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
			const adjustedContractName = isLocalNetwork(networkName)
				? `${contractName}Mock`
				: contractName;
			const ContractFactory = await ethers.getContractFactory(
				adjustedContractName,
				signer
			);

			const contract = await upgrades.upgradeProxy(
				contractAddress,
				ContractFactory,
				{
					kind: "transparent",
					unsafeSkipStorageCheck: unsafe,
				}
			);
			await contract.waitForDeployment();

			const implementationAddress =
				await upgrades.erc1967.getImplementationAddress(
					contractAddress
				);
			console.log(
				`${contractName} upgraded with implementation ${implementationAddress}`
			);
		}
	);
