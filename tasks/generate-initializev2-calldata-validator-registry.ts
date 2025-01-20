import { AbiCoder } from "ethers";
import { task, types } from "hardhat/config";

interface TaskParams {
	validatorRegistryProxy: string;
	validatorRegistryImplementation: string;
	pol: string;
}

task("generate-initializev2-calldata-validator-registry")
	.setDescription(
		"Generate initializeV2 calldata for the ValidatorRegistry contract"
	)
	.addParam<string>(
		"validatorRegistryProxy",
		"Address of the ValidatorRegistry proxy contract",
		undefined,
		types.string
	)
	.addParam<string>(
		"validatorRegistryImplementation",
		"Address of the ValidatorRegistry implementation contract",
		undefined,
		types.string
	)
	.addParam<string>("pol", "POL contract address", undefined, types.string)
	.setAction(
		async (
			{
				validatorRegistryProxy: validatorRegistryProxyAddress,
				validatorRegistryImplementation:
					validatorRegistryImplementationAddress,
				pol: polAddress,
			}: TaskParams,
			{ ethers }
		) => {
			if (!ethers.isAddress(validatorRegistryProxyAddress)) {
				throw new Error("Invalid ValidatorRegistry proxy address");
			}
			if (!ethers.isAddress(validatorRegistryImplementationAddress)) {
				throw new Error(
					"Invalid ValidatorRegistry implementation address"
				);
			}
			if (!ethers.isAddress(polAddress)) {
				throw new Error("Invalid POL address");
			}

			const proxyAdmin = await ethers.getContractFactory(
				"contracts/ProxyAdmin.sol:ProxyAdmin"
			);
			const validatorRegistry =
				await ethers.getContractFactory("ValidatorRegistry");

			const initialzeV2Selector =
				validatorRegistry.interface.getFunction(
					"initializeV2"
				)?.selector;
			if (!initialzeV2Selector) {
				throw new Error(
					"InitializeV2 selector on ValidatorRegistry not defined"
				);
			}

			const abiCoder = new AbiCoder();
			const encodedPOLAddress = abiCoder.encode(
				["address"],
				[polAddress]
			);

			const initializeV2Calldata =
				proxyAdmin.interface.encodeFunctionData("upgradeAndCall", [
					validatorRegistryProxyAddress,
					validatorRegistryImplementationAddress,
					`${initialzeV2Selector}${encodedPOLAddress.slice(2)}`,
				]);

			console.log("Initialize v2 calldata:\n%s", initializeV2Calldata);
		}
	);
