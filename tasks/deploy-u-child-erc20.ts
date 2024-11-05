import { TASK_CLEAN, TASK_COMPILE } from "hardhat/builtin-tasks/task-names";
import { task, types } from "hardhat/config";
import { getSigner } from "../utils/account";
import { isLocalNetwork, Network } from "../utils/network";

interface TaskParams {
	name: string;
	symbol: string;
	childChainManager: string;
}

task("deploy:u-child-erc20")
	.setDescription("Deploy the UChildERC20 contract")
	.addParam<string>("name", "ERC20 name", undefined, types.string)
	.addParam<string>("symbol", "ERC20 symbol", undefined, types.string)
	.addParam<string>(
		"childChainManager",
		"Address of the ChildChainManager contract",
		undefined,
		types.string
	)
	.setAction(
		async (
			{
				name,
				symbol,
				childChainManager: childChainManagerAddress,
			}: TaskParams,
			{ ethers, network, run, upgrades }
		) => {
			if (!name) {
				throw new Error("Empty name");
			}
			if (!symbol) {
				throw new Error("Empty symbol");
			}
			if (!ethers.isAddress(childChainManagerAddress)) {
				throw new Error("Invalid ChildChainManager address");
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
			const UChildERC20 = await ethers.getContractFactory(
				"UChildERC20",
				signer
			);

			const uChildERC20 = await upgrades.deployProxy(
				UChildERC20,
				[name, symbol, childChainManagerAddress],
				{ kind: "transparent" }
			);
			await uChildERC20.waitForDeployment();

			const uChildERC20Address = await uChildERC20.getAddress();
			console.log(`UChildERC20 Proxy deployed at ${uChildERC20Address}`);

			const implementationAddress =
				await upgrades.erc1967.getImplementationAddress(
					uChildERC20Address
				);
			console.log(
				`UChildERC20 Implementation deployed at ${implementationAddress}`
			);
			const proxyAdminAddress =
				await upgrades.erc1967.getAdminAddress(uChildERC20Address);
			console.log(
				`UChildERC20 ProxyAdmin deployed at ${proxyAdminAddress}`
			);
		}
	);
