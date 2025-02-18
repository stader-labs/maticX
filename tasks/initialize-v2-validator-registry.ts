import { task, types } from "hardhat/config";
import { getSigner } from "../utils/account";
import { isLocalNetwork, Network } from "../utils/network";

interface TaskParams {
	contract: string;
	polToken: string;
}

task("initialize-v2:validator-registry")
	.setDescription("Initialize v2 the ValidatorRegistry contract")
	.addParam<string>("contract", "Contract address", undefined, types.string)
	.addParam<string>("polToken", "POL token address", undefined, types.string)
	.setAction(
		async (
			{
				contract: contractAddress,
				polToken: polTokenAddress,
			}: TaskParams,
			{ ethers, network }
		) => {
			if (!ethers.isAddress(contractAddress)) {
				throw new Error("Invalid contract address");
			}
			if (!ethers.isAddress(polTokenAddress)) {
				throw new Error("Invalid POL token address");
			}

			const networkName = network.name as Network;
			console.log(`Network name: ${network.name}`);
			if (isLocalNetwork(networkName)) {
				throw new Error("Unsupported network");
			}

			const signer = await getSigner(
				ethers,
				network.provider,
				network.config.from
			);
			const contractFactory = await ethers.getContractAt(
				"ValidatorRegistry",
				contractAddress,
				signer
			);

			const tx = await contractFactory.initializeV2(polTokenAddress);
			await tx.wait(1);
			console.log(
				`ValidatorRegistry initialized v2 at ${contractAddress}`
			);
		}
	);
