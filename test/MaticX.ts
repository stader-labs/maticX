import {
	loadFixture,
	setBalance,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
	IERC20,
	IFxStateRootTunnel,
	IPolygonMigration,
	IStakeManager,
	MaticX,
} from "../typechain";

describe("MaticX", function () {
	const stakeAmount = ethers.utils.parseUnits("100", 18);

	async function deployFixture() {
		// EOA setups
		const maticXManager = await impersonateAccount(
			"0x75db63125A4f04E59A1A2Ab4aCC4FC1Cd5Daddd5"
		);
		const maticHolder = await impersonateAccount(
			"0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0"
		);
		const fxStateRootTunnelManager = await impersonateAccount(
			"0x80A43dd35382C4919991C5Bca7f46Dd24Fde4C67"
		);
		const [staker] = await ethers.getSigners();

		// Contract setups
		const validatorRegistry = await ethers.getContractAt(
			"ValidatorRegistry",
			"0xf556442D5B77A4B0252630E15d8BbE2160870d77"
		);
		const stakeManager = (await ethers.getContractAt(
			"IStakeManager",
			"0x5e3Ef299fDDf15eAa0432E6e66473ace8c13D908"
		)) as IStakeManager;

		const matic = (await ethers.getContractAt(
			"IERC20",
			"0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0"
		)) as IERC20;

		const pol = (await ethers.getContractAt(
			"IERC20",
			"0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6"
		)) as IERC20;

		const polygonMigration = (await ethers.getContractAt(
			"IPolygonMigration",
			"0x29e7DF7b6A1B2b07b731457f499E1696c60E2C4e"
		)) as IPolygonMigration;

		const fxStateRootTunnel = (await ethers.getContractAt(
			"IFxStateRootTunnel",
			"0x40FB804Cc07302b89EC16a9f8d040506f64dFe29",
			fxStateRootTunnelManager
		)) as IFxStateRootTunnel;

		const MaticX = await ethers.getContractFactory("MaticX");
		const maticX = (await upgrades.deployProxy(MaticX, [
			validatorRegistry.address,
			stakeManager.address,
			matic.address,
			maticXManager.address,
			maticXManager.address,
		])) as MaticX;

		// Contract initializations
		await fxStateRootTunnel
			.connect(fxStateRootTunnelManager)
			.setMaticX(maticX.address);

		await maticX
			.connect(maticXManager)
			.setFxStateRootTunnel(fxStateRootTunnel.address);
		await maticX.connect(maticXManager).setPOLToken(pol.address);
		await maticX.connect(maticXManager).initializePOL();

		// ERC20 transfers
		await matic.connect(maticHolder).transfer(staker.address, stakeAmount);

		await matic
			.connect(maticHolder)
			.approve(polygonMigration.address, stakeAmount);
		await polygonMigration.connect(maticHolder).migrate(stakeAmount);
		await pol.connect(maticHolder).transfer(staker.address, stakeAmount);

		return {
			maticX,
			stakeManager,
			validatorRegistry,
			matic,
			pol,
			polygonMigration,
			fxStateRootTunnel,
			maticXManager,
			staker,
		};
	}

	async function impersonateAccount(
		address: string
	): Promise<SignerWithAddress> {
		setBalance(address, ethers.utils.parseEther("10000"));
		return await ethers.getImpersonatedSigner(address);
	}

	describe("Deploy the contract", function () {
		describe("Positive", function () {
			it("Should emit the Submit event for the Matic token", async function () {
				const { maticX, matic, staker } =
					await loadFixture(deployFixture);

				await matic
					.connect(staker)
					.approve(maticX.address, stakeAmount);

				const promise = maticX.connect(staker).submit(stakeAmount);
				await expect(promise)
					.to.emit(maticX, "Submit")
					.withArgs(staker.address, stakeAmount);
			});

			it("Should emit the Submit event for the POL token", async function () {
				const { maticX, pol, staker } =
					await loadFixture(deployFixture);

				await pol.connect(staker).approve(maticX.address, stakeAmount);

				const promise = maticX.connect(staker).submitPOL(stakeAmount);
				await expect(promise)
					.to.emit(maticX, "Submit")
					.withArgs(staker.address, stakeAmount);
			});
		});
	});
});
