import { TASK_CLEAN, TASK_COMPILE } from "hardhat/builtin-tasks/task-names";
import { task, types } from "hardhat/config";
import { getSigner } from "../utils/account";
import { isLocalNetwork, Network } from "../utils/network";

interface TaskParams {
	fxChild: string;
}

task("deploy:fx-state-child-tunnel")
	.setDescription("Deploy the FxStateChildTunnel contract")
	.addParam<string>(
		"fxChild",
		"Address of the FxChild contract",
		undefined,
		types.string
	)
	.setAction(
		async (
			{ fxChild: fxChildAddress }: TaskParams,
			{ ethers, network, run }
		) => {
			if (!ethers.utils.isAddress(fxChildAddress)) {
				throw new Error("Invalid FxChildAddress address");
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
			const FxStateChildTunnel = await ethers.getContractFactory(
				"FxStateChildTunnel",
				signer
			);

			const fxStateChildTunnel =
				await FxStateChildTunnel.deploy(fxChildAddress);
			await fxStateChildTunnel.deployed();
			console.log(
				`fxStateChildTunnel deployed at ${fxStateChildTunnel.address}`
			);
		}
	);
