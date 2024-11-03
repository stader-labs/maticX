import { TASK_CLEAN, TASK_COMPILE } from "hardhat/builtin-tasks/task-names";
import { task, types } from "hardhat/config";
import { getSigner } from "../utils/account";
import { isLocalNetwork, Network } from "../utils/network";

interface TaskParams {
	fxStateChildTunnel: string;
	maticX: string;
	manager: string;
	instantPoolOwner: string;
	treasury: string;
	instantWithdrawalFeeBps: number;
}

task("deploy:child-pool")
	.setDescription("Deploy the ChildPool contract")
	.addParam<string>(
		"fxStateChildTunnel",
		"Address of the FxStateChildTunnel contract",
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
	.addParam<string>(
		"instantPoolOwner",
		"Address of the InstantPoolOwner contract",
		undefined,
		types.string
	)
	.addParam<string>(
		"treasury",
		"Address of the Treasury contract",
		undefined,
		types.string
	)
	.addParam<number>(
		"instantWithdrawalFeeBps",
		"Instant withdrawal fee base points",
		50,
		types.int
	)
	.setAction(
		async (
			{
				fxStateChildTunnel: fxStateChildTunnelAddress,
				maticX: maticXAddress,
				manager: managerAddress,
				instantPoolOwner: instantPoolOwnerAddress,
				treasury: treasuryAddress,
				instantWithdrawalFeeBps,
			}: TaskParams,
			{ ethers, network, run, upgrades }
		) => {
			if (!ethers.utils.isAddress(fxStateChildTunnelAddress)) {
				throw new Error("Invalid FxStateChildTunnel address");
			}
			if (!ethers.utils.isAddress(maticXAddress)) {
				throw new Error("Invalid MaticX address");
			}
			if (!ethers.utils.isAddress(managerAddress)) {
				throw new Error("Invalid Manager address");
			}
			if (!ethers.utils.isAddress(instantPoolOwnerAddress)) {
				throw new Error("Invalid InstantPoolOwner address");
			}
			if (!ethers.utils.isAddress(treasuryAddress)) {
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
			const ChildPool = await ethers.getContractFactory(
				"ChildPool",
				signer
			);

			const childPool = await upgrades.deployProxy(
				ChildPool,
				[
					fxStateChildTunnelAddress,
					maticXAddress,
					managerAddress,
					instantPoolOwnerAddress,
					treasuryAddress,
					instantWithdrawalFeeBps,
				],
				{ kind: "transparent" }
			);
			await childPool.deployed();
			console.log(`ChildPool Proxy deployed at ${childPool.address}`);

			const implementationAddress =
				await upgrades.erc1967.getImplementationAddress(
					childPool.address
				);
			console.log(
				`ChildPool Implementation deployed at ${implementationAddress}`
			);
			const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(
				childPool.address
			);
			console.log(
				`ChildPool ProxyAdmin deployed at ${proxyAdminAddress}`
			);
		}
	);
