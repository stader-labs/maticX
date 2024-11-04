import { TASK_CLEAN, TASK_COMPILE } from "hardhat/builtin-tasks/task-names";
import { task, types } from "hardhat/config";
import { getSigner } from "../utils/account";
import { isLocalNetwork, Network } from "../utils/network";

interface TaskParams {
	checkpointManager: string;
	fxRoot: string;
	maticX: string;
}

task("deploy:fx-state-root-tunnel")
	.setDescription("Deploy the FxStateRootTunnel contract")
	.addParam<string>(
		"checkpointManager",
		"Address of the CheckpointManager contract",
		undefined,
		types.string
	)
	.addParam<string>(
		"fxRoot",
		"Address of the FxRoot contract",
		undefined,
		types.string
	)
	.addParam<string>(
		"maticX",
		"Address of the MaticX contract",
		undefined,
		types.string
	)
	.setAction(
		async (
			{
				checkpointManager: checkpointManagerAddress,
				fxRoot: fxRootAddress,
				maticX: maticXAddress,
			}: TaskParams,
			{ ethers, network, run }
		) => {
			if (!ethers.isAddress(checkpointManagerAddress)) {
				throw new Error("Invalid CheckpointManager address");
			}
			if (!ethers.isAddress(fxRootAddress)) {
				throw new Error("Invalid FxRootAddress address");
			}
			if (!ethers.isAddress(maticXAddress)) {
				throw new Error("Invalid MaticX address");
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
			const FxStateRootTunnel = await ethers.getContractFactory(
				"FxStateRootTunnel",
				signer
			);

			const fxStateRootTunnel = await FxStateRootTunnel.deploy(
				checkpointManagerAddress,
				fxRootAddress,
				maticXAddress
			);
			await fxStateRootTunnel.waitForDeployment();

			const fxStateRootTunnelAddress =
				await fxStateRootTunnel.getAddress();
			console.log(
				`FxStateRootTunnel deployed at ${fxStateRootTunnelAddress}`
			);
		}
	);
