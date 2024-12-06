import { AbiCoder } from "ethers";
import { task, types } from "hardhat/config";

interface TaskParams {
	maticXProxy: string;
	maticXImplementation: string;
	pol: string;
}

task("generate-initializev2-calldata-matic-x")
	.setDescription("Generate initializeV2 calldata for the MaticX contract")
	.addParam<string>(
		"maticXProxy",
		"Address of the MaticX proxy contract",
		undefined,
		types.string
	)
	.addParam<string>(
		"maticXImplementation",
		"Address of the MaticX implementation contract",
		undefined,
		types.string
	)
	.addParam<string>("pol", "POL contract address", undefined, types.string)
	.setAction(
		async (
			{
				maticXProxy: maticXProxyAddress,
				maticXImplementation: maticXImplementationAddress,
				pol: polAddress,
			}: TaskParams,
			{ ethers }
		) => {
			if (!ethers.isAddress(maticXProxyAddress)) {
				throw new Error("Invalid MaticX proxy address");
			}
			if (!ethers.isAddress(maticXImplementationAddress)) {
				throw new Error("Invalid MaticX implementation address");
			}
			if (!ethers.isAddress(polAddress)) {
				throw new Error("Invalid POL address");
			}

			const proxyAdmin = await ethers.getContractFactory(
				"contracts/ProxyAdmin.sol:ProxyAdmin"
			);
			const maticX = await ethers.getContractFactory("MaticX");

			const initialzeV2Selector =
				maticX.interface.getFunction("initializeV2")?.selector;
			if (!initialzeV2Selector) {
				throw new Error("InitializeV2 selector on MaticX not defined");
			}

			const abiCoder = new AbiCoder();
			const encodedPOLAddress = abiCoder.encode(
				["address"],
				[polAddress]
			);

			const initializeV2Calldata =
				proxyAdmin.interface.encodeFunctionData("upgradeAndCall", [
					maticXProxyAddress,
					maticXImplementationAddress,
					`${initialzeV2Selector}${encodedPOLAddress.slice(2)}`,
				]);

			console.log("Initialize v2 calldata:\n%s", initializeV2Calldata);
		}
	);
