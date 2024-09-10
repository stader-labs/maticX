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
	IValidatorShare,
	MaticX,
	ValidatorRegistry,
} from "../typechain";

describe("MaticX", function () {
	const stakeAmount = ethers.utils.parseUnits("100", 18);
	const totalStakeAmount = stakeAmount.mul(3);

	async function deployFixture() {
		// EOAs
		const manager = await impersonateAccount(
			"0x80A43dd35382C4919991C5Bca7f46Dd24Fde4C67"
		);
		const maticHolder = await impersonateAccount(
			"0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0"
		);
		const [stakerA, stakerB] = await ethers.getSigners();
		const stakers = [stakerA, stakerB];

		// Contracts
		const validatorRegistry = (await ethers.getContractAt(
			"ValidatorRegistry",
			"0xf556442D5B77A4B0252630E15d8BbE2160870d77",
			manager
		)) as ValidatorRegistry;

		const fxStateRootTunnel = (await ethers.getContractAt(
			"IFxStateRootTunnel",
			"0x40FB804Cc07302b89EC16a9f8d040506f64dFe29",
			manager
		)) as IFxStateRootTunnel;

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

		const MaticX = await ethers.getContractFactory("MaticX");
		const maticX = (await upgrades.deployProxy(MaticX, [
			validatorRegistry.address,
			stakeManager.address,
			matic.address,
			manager.address,
			manager.address,
		])) as MaticX;

		// Contract initializations
		const validators = await validatorRegistry.getValidators();
		const preferredDepositValidatorId = validators[0];
		validatorRegistry.setPreferredDepositValidatorId(
			preferredDepositValidatorId
		);

		const preferredWithdrawalValidatorId = validators[0];
		validatorRegistry.setPreferredWithdrawalValidatorId(
			preferredWithdrawalValidatorId
		);

		await fxStateRootTunnel.connect(manager).setMaticX(maticX.address);

		await maticX
			.connect(manager)
			.setFxStateRootTunnel(fxStateRootTunnel.address);
		await maticX.connect(manager).setPOLToken(pol.address);

		// ERC20 transfers
		for (const staker of stakers) {
			await matic
				.connect(maticHolder)
				.transfer(staker.address, totalStakeAmount);
		}

		await matic
			.connect(maticHolder)
			.approve(polygonMigration.address, totalStakeAmount.mul(2));
		await polygonMigration
			.connect(maticHolder)
			.migrate(totalStakeAmount.mul(2));

		for (const staker of stakers) {
			await pol
				.connect(maticHolder)
				.transfer(staker.address, totalStakeAmount);
		}

		return {
			maticX,
			stakeManager,
			validatorRegistry,
			matic,
			pol,
			polygonMigration,
			fxStateRootTunnel,
			manager,
			stakerA,
			stakerB,
			stakers,
			preferredDepositValidatorId,
			preferredWithdrawalValidatorId,
		};
	}

	async function impersonateAccount(
		address: string
	): Promise<SignerWithAddress> {
		setBalance(address, ethers.utils.parseEther("10000"));
		return await ethers.getImpersonatedSigner(address);
	}

	describe("Submit Matic", function () {
		describe("Negative", function () {
			it("Should revert with the right error if passing the zero amount", async function () {
				const { maticX, stakerA } = await loadFixture(deployFixture);

				const promise = maticX.connect(stakerA).submit(0);
				await expect(promise).to.be.revertedWith("Invalid amount");
			});

			it("Should revert with the right error if having insufficient token approval from the user", async function () {
				const { maticX, matic, stakerA } =
					await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticX.address, stakeAmount.sub(1));

				const promise = maticX.connect(stakerA).submit(stakeAmount);
				await expect(promise).to.be.revertedWith(
					"SafeERC20: low-level call failed"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the Submit and Delegate events", async function () {
				const { maticX, matic, stakerA, preferredDepositValidatorId } =
					await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticX.address, stakeAmount);

				const promise = maticX.connect(stakerA).submit(stakeAmount);
				await expect(promise)
					.to.emit(maticX, "Submit")
					.withArgs(stakerA.address, stakeAmount)
					.and.to.emit(maticX, "Delegate")
					.withArgs(preferredDepositValidatorId, stakeAmount);
			});

			it("Should emit the Transfer event", async function () {
				const { maticX, matic, stakerA } =
					await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticX.address, stakeAmount);

				const promise = maticX.connect(stakerA).submit(stakeAmount);
				await expect(promise)
					.to.emit(maticX, "Transfer")
					.withArgs(
						ethers.constants.AddressZero,
						stakerA.address,
						stakeAmount
					);
			});

			it("Should emit the ShareMinted event on the StakingInfo contract", async function () {
				const {
					maticX,
					stakeManager,
					matic,
					stakerA,
					preferredDepositValidatorId,
				} = await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticX.address, stakeAmount);

				const validatorShareAddress =
					await stakeManager.getValidatorContract(
						preferredDepositValidatorId
					);
				const validatorShare = (await ethers.getContractAt(
					"IValidatorShare",
					validatorShareAddress
				)) as IValidatorShare;

				const stakingLoggerAddress =
					await validatorShare.stakingLogger();
				const stakingLogger = await ethers.getContractAt(
					"IStakingInfo",
					stakingLoggerAddress
				);

				const promise = maticX.connect(stakerA).submit(stakeAmount);
				await expect(promise)
					.to.emit(stakingLogger, "ShareMinted")
					.withArgs(
						preferredDepositValidatorId,
						maticX.address,
						stakeAmount,
						stakeAmount
					);
			});

			it("Should return the right MaticX balance", async function () {
				const { maticX, matic, stakerA } =
					await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticX.address, stakeAmount);

				const promise = maticX.connect(stakerA).submit(stakeAmount);
				await expect(promise).to.changeTokenBalance(
					maticX,
					stakerA,
					stakeAmount
				);
			});

			it("Should the right Matic and POL balances", async function () {
				const { maticX, stakeManager, matic, pol, stakerA } =
					await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticX.address, stakeAmount);

				const promise = maticX.connect(stakerA).submit(stakeAmount);
				await expect(promise).to.changeTokenBalances(
					matic,
					[stakerA, maticX],
					[stakeAmount.mul(-1), 0]
				);
				await expect(promise).to.changeTokenBalances(
					pol,
					[stakeManager],
					[stakeAmount]
				);
			});

			it("Should return the right total pooled stake tokens", async function () {
				const { maticX, matic, stakers } =
					await loadFixture(deployFixture);

				for (const staker of stakers) {
					await matic
						.connect(staker)
						.approve(maticX.address, totalStakeAmount);

					for (let i = 0; i < 3; i++) {
						await maticX.connect(staker).submit(stakeAmount);
					}
				}

				const totalPooledStakeTokens =
					await maticX.getTotalPooledStakeTokens();
				expect(totalPooledStakeTokens).to.equal(
					totalStakeAmount.mul(2)
				);
			});

			it("Should return the right total stake from a validator share", async function () {
				const {
					maticX,
					stakeManager,
					matic,
					stakers,
					preferredDepositValidatorId,
				} = await loadFixture(deployFixture);

				const validatorShareAddress =
					await stakeManager.getValidatorContract(
						preferredDepositValidatorId
					);
				const initialTotalStake = await maticX.getTotalStake(
					validatorShareAddress
				);

				for (const staker of stakers) {
					await matic
						.connect(staker)
						.approve(maticX.address, stakeAmount);
					await maticX.connect(staker).submit(stakeAmount);
				}

				const currentTotalStake = await maticX.getTotalStake(
					validatorShareAddress
				);
				expect(currentTotalStake).not.to.equal(initialTotalStake);
				expect(currentTotalStake[0]).to.equal(stakeAmount.mul(2));
				expect(currentTotalStake[1]).to.equal(
					ethers.utils.parseUnits("100000000000", 18)
				);
			});
		});
	});

	describe("Submit POL", function () {
		describe("Negative", function () {
			it("Should revert with the right error if passing the zero amount", async function () {
				const { maticX, stakerA } = await loadFixture(deployFixture);

				const promise = maticX.connect(stakerA).submitPOL(0);
				await expect(promise).to.be.revertedWith("Invalid amount");
			});

			it("Should revert with the right error if having insufficient token approval from the user", async function () {
				const { maticX, pol, stakerA } =
					await loadFixture(deployFixture);

				await pol
					.connect(stakerA)
					.approve(maticX.address, stakeAmount.sub(1));

				const promise = maticX.connect(stakerA).submit(stakeAmount);
				await expect(promise).to.be.revertedWith(
					"SafeERC20: low-level call failed"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the Submit and Delegate events on the MaticX contract", async function () {
				const { maticX, pol, stakerA, preferredDepositValidatorId } =
					await loadFixture(deployFixture);

				await pol.connect(stakerA).approve(maticX.address, stakeAmount);

				const promise = maticX.connect(stakerA).submitPOL(stakeAmount);
				await expect(promise)
					.to.emit(maticX, "Submit")
					.withArgs(stakerA.address, stakeAmount)
					.and.to.emit(maticX, "Delegate")
					.withArgs(preferredDepositValidatorId, stakeAmount);
			});

			it("Should emit the Transfer event on the MaticX contract", async function () {
				const { maticX, pol, stakerA } =
					await loadFixture(deployFixture);

				await pol.connect(stakerA).approve(maticX.address, stakeAmount);

				const promise = maticX.connect(stakerA).submitPOL(stakeAmount);
				await expect(promise)
					.to.emit(maticX, "Transfer")
					.withArgs(
						ethers.constants.AddressZero,
						stakerA.address,
						stakeAmount
					);
			});

			it("Should emit the ShareMinted event on the StakingInfo contract", async function () {
				const {
					maticX,
					stakeManager,
					pol,
					stakerA,
					preferredDepositValidatorId,
				} = await loadFixture(deployFixture);

				await pol.connect(stakerA).approve(maticX.address, stakeAmount);

				const validatorShareAddress =
					await stakeManager.getValidatorContract(
						preferredDepositValidatorId
					);
				const validatorShare = (await ethers.getContractAt(
					"IValidatorShare",
					validatorShareAddress
				)) as IValidatorShare;

				const stakingLoggerAddress =
					await validatorShare.stakingLogger();
				const stakingLogger = await ethers.getContractAt(
					"IStakingInfo",
					stakingLoggerAddress
				);

				const promise = maticX.connect(stakerA).submitPOL(stakeAmount);
				await expect(promise)
					.to.emit(stakingLogger, "ShareMinted")
					.withArgs(
						preferredDepositValidatorId,
						maticX.address,
						stakeAmount,
						stakeAmount
					);
			});

			it("Should return the right MaticX balance", async function () {
				const { maticX, pol, stakerA } =
					await loadFixture(deployFixture);

				await pol.connect(stakerA).approve(maticX.address, stakeAmount);

				const promise = maticX.connect(stakerA).submitPOL(stakeAmount);
				await expect(promise).to.changeTokenBalance(
					maticX,
					stakerA,
					stakeAmount
				);
			});

			it("Should the right POL balances", async function () {
				const { maticX, stakeManager, pol, stakerA } =
					await loadFixture(deployFixture);

				await pol.connect(stakerA).approve(maticX.address, stakeAmount);

				const promise = maticX.connect(stakerA).submitPOL(stakeAmount);
				await expect(promise).to.changeTokenBalances(
					pol,
					[stakerA, maticX, stakeManager],
					[stakeAmount.mul(-1), 0, stakeAmount]
				);
			});

			it("Should return the right total pooled stake tokens", async function () {
				const { maticX, pol, stakers } =
					await loadFixture(deployFixture);

				for (const staker of stakers) {
					await pol
						.connect(staker)
						.approve(maticX.address, totalStakeAmount);

					for (let i = 0; i < 3; i++) {
						await maticX.connect(staker).submitPOL(stakeAmount);
					}
				}

				const totalPooledStakeTokens =
					await maticX.getTotalPooledStakeTokens();
				expect(totalPooledStakeTokens).to.equal(
					totalStakeAmount.mul(2)
				);
			});

			it("Should return the right total stake from a validator share", async function () {
				const {
					maticX,
					stakeManager,
					pol,
					stakers,
					preferredDepositValidatorId,
				} = await loadFixture(deployFixture);

				const validatorShareAddress =
					await stakeManager.getValidatorContract(
						preferredDepositValidatorId
					);
				const initialTotalStake = await maticX.getTotalStake(
					validatorShareAddress
				);

				for (const staker of stakers) {
					await pol
						.connect(staker)
						.approve(maticX.address, stakeAmount);
					await maticX.connect(staker).submitPOL(stakeAmount);
				}

				const currentTotalStake = await maticX.getTotalStake(
					validatorShareAddress
				);
				expect(currentTotalStake).not.to.equal(initialTotalStake);
				expect(currentTotalStake[0]).to.equal(stakeAmount.mul(2));
				expect(currentTotalStake[1]).to.equal(
					ethers.utils.parseUnits("100000000000", 18)
				);
			});
		});
	});

	describe("Request a Matic withdrawal", function () {
		describe("Positive", function () {
			it("Should revert with the right error if burning a too much amount", async function () {
				const { maticX, matic, stakerA } =
					await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticX.address, stakeAmount);

				await maticX.connect(stakerA).submit(stakeAmount);

				const promise = maticX
					.connect(stakerA)
					.requestWithdraw(stakeAmount.add(1));
				await expect(promise).to.be.revertedWith(
					"ERC20: burn amount exceeds balance"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the RequestWithdraw event", async function () {
				const { maticX, matic, stakerA } =
					await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticX.address, stakeAmount);

				await maticX.connect(stakerA).submit(stakeAmount);

				const promise = maticX
					.connect(stakerA)
					.requestWithdraw(stakeAmount);
				await expect(promise)
					.to.emit(maticX, "RequestWithdraw")
					.withArgs(stakerA.address, stakeAmount, stakeAmount);
			});
		});
	});
});
