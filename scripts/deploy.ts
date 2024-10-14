import { ethers } from "hardhat";
import { MaticXDeployer } from "./deployers";

const main = async () => {
	const [rootSigner] = await ethers.getSigners();

	const maticXDeployer =
		await MaticXDeployer.CreateMaticXDeployer(rootSigner);
	await maticXDeployer.deploy();
	await maticXDeployer.export();
};

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
