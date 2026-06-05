import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
	getStorageAt,
	loadFixture,
	reset,
	setBalance,
	setStorageAt,
	time,
} from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
	FxStateRootTunnel,
	IERC20,
	IFxStateRootTunnel,
	IStakeManager,
	MaticX,
	ValidatorRegistry,
} from "../typechain-types";
import { extractEnvironmentVariables } from "../utils/environment";
import { getProviderUrl, Network } from "../utils/network";

const envVars = extractEnvironmentVariables();

const providerUrl =
	process.env.MAINNET_RPC_URL ||
	getProviderUrl(
		Network.Ethereum,
		envVars.RPC_PROVIDER,
		envVars.ETHEREUM_API_KEY
	);

describe("MaticX sunset", function () {
	const stakeAmount = ethers.parseUnits("100", 18);
	const CUSTODY_DELAY = 3n * 365n * 24n * 60n * 60n;
	const TERMINAL_RATE_PRECISION = 10n ** 18n;

	async function impersonate(address: string): Promise<SignerWithAddress> {
		await setBalance(address, ethers.parseEther("10000"));
		return await ethers.getImpersonatedSigner(address);
	}

	async function deployFixture() {

		const forkBlock = process.env.MAINNET_RPC_URL
			? undefined
			: envVars.FORKING_BLOCK_NUMBER;
		await reset(providerUrl, forkBlock);

		const manager = await impersonate(
			"0x80A43dd35382C4919991C5Bca7f46Dd24Fde4C67"
		);
		const polygonTreasury = await impersonate(
			"0xcD6507d87F605F5E95C12F7c4B1fC3279dc944aB"
		);
		const stakeManagerGovernance = await impersonate(
			"0x6e7a5820baD6cebA8Ef5ea69c0C92EbbDAc9CE48"
		);

		const [, bot, treasury, stakerA, stakerB, custody, attacker] =
			await ethers.getSigners();

		const validatorRegistry = (await ethers.getContractAt(
			"ValidatorRegistry",
			"0xf556442D5B77A4B0252630E15d8BbE2160870d77",
			manager
		)) as unknown as ValidatorRegistry;

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

		const MaticXFactory = await ethers.getContractFactory("MaticX");
		const maticXContract = await upgrades.deployProxy(MaticXFactory, [
			await validatorRegistry.getAddress(),
			await stakeManager.getAddress(),
			await matic.getAddress(),
			manager.address,
			treasury.address,
		]);
		const maticX = maticXContract as unknown as MaticX;
		const maticXAddress = await maticX.getAddress();

		const [preferredDepositValidatorId, preferredWithdrawalValidatorId] =
			await validatorRegistry.getValidators();
		await validatorRegistry
			.connect(manager)
			.setPreferredDepositValidatorId(preferredDepositValidatorId);
		await validatorRegistry
			.connect(manager)
			.setPreferredWithdrawalValidatorId(preferredWithdrawalValidatorId);

		await (
			fxStateRootTunnel.connect(manager) as FxStateRootTunnel
		).setMaticX(maticXAddress);

		await (maticX.connect(manager) as MaticX).initializeV2(
			await pol.getAddress()
		);

		await (maticX.connect(manager) as MaticX).setCustodyDelay(
			CUSTODY_DELAY
		);
		await (maticX.connect(manager) as MaticX).setFxStateRootTunnel(
			await fxStateRootTunnel.getAddress()
		);

		const botRole = await maticX.BOT();
		await (maticX.connect(manager) as MaticX).grantRole(
			botRole,
			bot.address
		);

		for (const staker of [stakerA, stakerB]) {
			await pol
				.connect(polygonTreasury)
				.transfer(staker.address, stakeAmount * 3n);
			await pol.connect(staker).approve(maticXAddress, stakeAmount * 3n);
			await (maticX.connect(staker) as MaticX).submitPOL(stakeAmount);
		}

		return {
			maticX,
			maticXAddress,
			stakeManager,
			stakeManagerGovernance,
			validatorRegistry,
			fxStateRootTunnel,
			matic,
			pol,
			manager,
			bot,
			treasury,
			stakerA,
			stakerB,
			custody,
			attacker,
			polygonTreasury,
		};
	}

	async function advanceUnbond(
		stakeManager: IStakeManager,
		stakeManagerGovernance: SignerWithAddress
	) {
		const currentEpoch = await stakeManager.epoch();
		const withdrawalDelay = await stakeManager.withdrawalDelay();
		await stakeManager
			.connect(stakeManagerGovernance)
			.setCurrentEpoch(currentEpoch + withdrawalDelay + 1n);
	}

	async function pauseRecallAndFinalize(
		fx: Awaited<ReturnType<typeof deployFixture>>
	) {
		const { maticX, manager, stakeManager, stakeManagerGovernance } = fx;
		await (maticX.connect(manager) as MaticX).togglePause();
		await (maticX.connect(manager) as MaticX).bulkUnstakeAllValidators();
		await advanceUnbond(stakeManager, stakeManagerGovernance);
		await (maticX.connect(manager) as MaticX).claimAssetRecallNonces();
		await (maticX.connect(manager) as MaticX).finalizeTerminalRate();
	}

	async function findScalarStorageSlot(
		address: string,
		expectedValue: bigint,
		readValue: () => Promise<bigint>,
		probeValue: bigint,
		maxSlots = 1000
	): Promise<number> {
		const target = ethers.toBeHex(expectedValue, 32).toLowerCase();
		for (let slot = 0; slot < maxSlots; slot++) {
			const value = (await getStorageAt(address, slot)).toLowerCase();
			if (value !== target) continue;

			await setStorageAt(address, slot, probeValue);
			const observed = await readValue();
			await setStorageAt(address, slot, expectedValue);

			if (observed === probeValue) return slot;
		}
		throw new Error(
			`Could not find storage slot for ${expectedValue.toString()}`
		);
	}

	async function findMappingSlot(
		contractAddress: string,
		key: string,
		readValue: () => Promise<bigint>,
		probeValue: bigint,
		maxSlots = 1000
	): Promise<number> {
		const abiCoder = ethers.AbiCoder.defaultAbiCoder();
		for (let s = 0; s < maxSlots; s++) {
			const valueSlot = ethers.keccak256(
				abiCoder.encode(["address", "uint256"], [key, s])
			);
			const original = await getStorageAt(contractAddress, valueSlot);
			await setStorageAt(contractAddress, valueSlot, probeValue);
			const observed = await readValue();
			await setStorageAt(contractAddress, valueSlot, original);
			if (observed === probeValue) return s;
		}
		throw new Error(
			`Could not find mapping slot for key ${key} on ${contractAddress}`
		);
	}

	async function writeMappingValue(
		contractAddress: string,
		mappingSlot: number,
		key: string,
		value: bigint
	): Promise<void> {
		const abiCoder = ethers.AbiCoder.defaultAbiCoder();
		const valueSlot = ethers.keccak256(
			abiCoder.encode(["address", "uint256"], [key, mappingSlot])
		);
		await setStorageAt(contractAddress, valueSlot, value);
	}

	describe("End-to-end happy path", function () {
		it("runs the full sunset sequence and lets users redeem at the terminal rate", async function () {
			const fx = await loadFixture(deployFixture);
			const {
				maticX,
				maticXAddress,
				manager,
				pol,
				stakerA,
				stakerB,
				custody,
				stakeManager,
				stakeManagerGovernance,
			} = fx;

			await (maticX.connect(manager) as MaticX).togglePause();
			expect(await maticX.paused()).to.equal(true);

			const [preferredId] = await fx.validatorRegistry.getValidators();
			const preferredShare =
				await stakeManager.getValidatorContract(preferredId);
			const vs = await ethers.getContractAt(
				[
					"function getTotalStake(address) view returns (uint256, uint256)",
					"function unbondNonces(address) view returns (uint256)",
				],
				preferredShare
			);
			const [stakeBefore] = (await vs.getTotalStake(maticXAddress)) as [
				bigint,
				bigint,
			];
			const nonceBefore = (await vs.unbondNonces(
				maticXAddress
			)) as bigint;
			await expect(
				(maticX.connect(manager) as MaticX).bulkUnstakeAllValidators()
			)
				.to.emit(maticX, "AssetRecallInitiated")
				.withArgs(preferredShare, nonceBefore + 1n, stakeBefore);

			await advanceUnbond(stakeManager, stakeManagerGovernance);

			const polBalBefore = await pol.balanceOf(maticXAddress);
			await (maticX.connect(manager) as MaticX).claimAssetRecallNonces();
			const polBalAfter = await pol.balanceOf(maticXAddress);
			expect(polBalAfter).to.be.gt(polBalBefore);

			const supply = await maticX.totalSupply();
			const expectedRate =
				(polBalAfter * TERMINAL_RATE_PRECISION) / supply;
			await expect(
				(maticX.connect(manager) as MaticX).finalizeTerminalRate()
			)
				.to.emit(maticX, "AssetRecallCompleted")
				.withArgs(polBalAfter, supply, expectedRate);

			expect(await maticX.terminalRateLocked()).to.equal(true);
			expect(await maticX.terminalRate()).to.equal(expectedRate);
			expect(await pol.balanceOf(maticXAddress)).to.equal(polBalAfter);

			await expect(
				(maticX.connect(manager) as MaticX).pushTerminalRateToL2()
			)
				.to.emit(maticX, "TerminalRatePushedToL2")
				.withArgs(supply, polBalAfter);

			await expect(
				(maticX.connect(manager) as MaticX).setInstantRedeemEnabled(
					true
				)
			)
				.to.emit(maticX, "InstantRedeemToggled")
				.withArgs(manager.address, true);

			const stakerAShares = await maticX.balanceOf(stakerA.address);
			const expectedPol =
				(stakerAShares * expectedRate) / TERMINAL_RATE_PRECISION;

			const recalledBefore = await pol.balanceOf(maticXAddress);
			await expect(
				(maticX.connect(stakerA) as MaticX).requestWithdraw(
					stakerAShares
				)
			)
				.to.emit(maticX, "InstantClaimed")
				.withArgs(stakerA.address, stakerAShares, expectedPol);

			expect(await maticX.balanceOf(stakerA.address)).to.equal(0n);
			expect(await pol.balanceOf(maticXAddress)).to.equal(
				recalledBefore - expectedPol
			);
			expect(await pol.balanceOf(stakerA.address)).to.be.gte(expectedPol);

			const polAddr = await pol.getAddress();
			const maticAddr = await fx.matic.getAddress();
			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					polAddr,
					custody.address
				)
			).to.be.revertedWithCustomError(maticX, "CustodyDelayNotElapsed");

			await time.increase(CUSTODY_DELAY + 1n);

			const polBeforeSweep = await pol.balanceOf(maticXAddress);
			const maticBeforeSweep = await fx.matic.balanceOf(maticXAddress);
			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					polAddr,
					custody.address
				)
			)
				.to.emit(maticX, "SweptToCustody")
				.withArgs(polAddr, custody.address, polBeforeSweep);

			if (maticBeforeSweep > 0n) {
				await expect(
					(maticX.connect(manager) as MaticX).sweepToCustody(
						maticAddr,
						custody.address
					)
				)
					.to.emit(maticX, "SweptToCustody")
					.withArgs(maticAddr, custody.address, maticBeforeSweep);
			}

			expect(await pol.balanceOf(maticXAddress)).to.equal(0);
			expect(await pol.balanceOf(custody.address)).to.equal(
				polBeforeSweep
			);
			expect(await maticX.assetCustodied()).to.equal(true);

			void stakerB;
		});
	});

	describe("Paused-state matrix", function () {
		it("blocks user write paths while paused but lets claimWithdrawal and the instant-redeem path through", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, manager, bot, pol, stakerA } = fx;

			await pauseRecallAndFinalize(fx);
			await (maticX.connect(manager) as MaticX).setInstantRedeemEnabled(
				true
			);

			await expect(
				(maticX.connect(stakerA) as MaticX).submit(stakeAmount)
			).to.be.revertedWith("Pausable: paused");
			await expect(
				(maticX.connect(stakerA) as MaticX).submitPOL(stakeAmount)
			).to.be.revertedWith("Pausable: paused");
			await expect(
				(maticX.connect(stakerA) as MaticX).withdrawRewards(1n)
			).to.be.revertedWith("Pausable: paused");
			await expect(
				(maticX.connect(bot) as MaticX).stakeRewardsAndDistributeFees(
					1n
				)
			).to.be.revertedWith("Pausable: paused");
			await expect(
				(maticX.connect(manager) as MaticX).setFeePercent(100)
			).to.be.revertedWith("Pausable: paused");

			const shares = await maticX.balanceOf(stakerA.address);
			await expect(
				(maticX.connect(stakerA) as MaticX).requestWithdraw(shares)
			).to.emit(maticX, "InstantClaimed");

			void pol;
		});
	});

	describe("bulkUnstakeAllValidators", function () {
		it("reverts without pause", async function () {
			const { maticX, manager } = await loadFixture(deployFixture);
			await expect(
				(maticX.connect(manager) as MaticX).bulkUnstakeAllValidators()
			).to.be.revertedWith("Pause first");
		});

		it("reverts for non-admin even when paused", async function () {
			const { maticX, manager, attacker } =
				await loadFixture(deployFixture);
			await (maticX.connect(manager) as MaticX).togglePause();
			await expect(
				(maticX.connect(attacker) as MaticX).bulkUnstakeAllValidators()
			).to.be.reverted;
		});

		it("reverts on the second call with RecallAlreadyInitiated", async function () {
			const { maticX, manager } = await loadFixture(deployFixture);
			await (maticX.connect(manager) as MaticX).togglePause();
			await (
				maticX.connect(manager) as MaticX
			).bulkUnstakeAllValidators();
			await expect(
				(maticX.connect(manager) as MaticX).bulkUnstakeAllValidators()
			).to.be.revertedWithCustomError(maticX, "RecallAlreadyInitiated");
		});

		it("reverts after terminalRateLocked", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, manager } = fx;
			await pauseRecallAndFinalize(fx);
			await expect(
				(maticX.connect(manager) as MaticX).bulkUnstakeAllValidators()
			).to.be.revertedWithCustomError(maticX, "RecallAlreadyInitiated");
		});

		it("skips validators with zero stake (no nonce, no event)", async function () {

			const fx = await loadFixture(deployFixture);
			const { maticX, manager, stakeManager, validatorRegistry } = fx;
			await (maticX.connect(manager) as MaticX).togglePause();

			const validatorIds = await validatorRegistry.getValidators();
			const sharesWithStake: string[] = [];
			const sharesWithoutStake: string[] = [];
			for (const id of validatorIds) {
				const share = await stakeManager.getValidatorContract(id);
				const vs = await ethers.getContractAt(
					[
						"function getTotalStake(address) view returns (uint256, uint256)",
					],
					share
				);
				const [stake] = (await vs.getTotalStake(
					await maticX.getAddress()
				)) as [bigint, bigint];
				if (stake > 0n) sharesWithStake.push(share);
				else sharesWithoutStake.push(share);
			}
			expect(sharesWithStake.length).to.be.gt(0);
			expect(sharesWithoutStake.length).to.be.gt(0);

			const tx = await (
				maticX.connect(manager) as MaticX
			).bulkUnstakeAllValidators();
			const receipt = await tx.wait();
			const event = maticX.interface.getEvent("AssetRecallInitiated");
			if (!event) throw new Error("AssetRecallInitiated event not found");
			const topic = event.topicHash;
			const emitted =
				receipt?.logs.filter((l) => l.topics[0] === topic).length ?? 0;
			expect(emitted).to.equal(sharesWithStake.length);

			for (const share of sharesWithStake) {
				expect(await maticX.assetRecallNonces(share)).to.be.gt(0n);
			}
			for (const share of sharesWithoutStake) {
				expect(await maticX.assetRecallNonces(share)).to.equal(0n);
			}
		});

		it("captured nonce equals validator unbondNonces post-sell (regression: not +1)", async function () {

			const fx = await loadFixture(deployFixture);
			const { maticX, maticXAddress, manager, stakeManager, validatorRegistry } = fx;
			await (maticX.connect(manager) as MaticX).togglePause();
			await (maticX.connect(manager) as MaticX).bulkUnstakeAllValidators();

			const validatorIds = await validatorRegistry.getValidators();
			let staked = 0;
			for (const id of validatorIds) {
				const share = await stakeManager.getValidatorContract(id);
				const stored = await maticX.assetRecallNonces(share);
				if (stored === 0n) continue;
				staked++;
				const vs = await ethers.getContractAt(
					["function unbondNonces(address) view returns (uint256)"],
					share
				);
				const live = (await vs.unbondNonces(maticXAddress)) as bigint;
				expect(stored).to.equal(live);
			}
			expect(staked).to.be.gt(0);
		});
	});

	describe("claimAssetRecallNonces", function () {
		it("reverts after recallComplete", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, manager } = fx;
			await pauseRecallAndFinalize(fx);
			await expect(
				(maticX.connect(manager) as MaticX).claimAssetRecallNonces()
			).to.be.revertedWithCustomError(maticX, "RecallAlreadyComplete");
		});

		it("reverts with RecallNotInitiated when called before bulkUnstake", async function () {
			const { maticX, manager } = await loadFixture(deployFixture);
			await (maticX.connect(manager) as MaticX).togglePause();
			await expect(
				(maticX.connect(manager) as MaticX).claimAssetRecallNonces()
			).to.be.revertedWithCustomError(maticX, "RecallNotInitiated");
		});

		it("is a no-op (no nonces, no revert) when called twice before the unbond matures", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, manager, stakeManager } = fx;
			await (maticX.connect(manager) as MaticX).togglePause();
			await (
				maticX.connect(manager) as MaticX
			).bulkUnstakeAllValidators();

			const validatorIds = await fx.validatorRegistry.getValidators();
			const shareAddrs = await Promise.all(
				validatorIds.map((id) => stakeManager.getValidatorContract(id))
			);
			const noncesBefore = await Promise.all(
				shareAddrs.map((vs) => maticX.assetRecallNonces(vs))
			);

			expect(noncesBefore.some((n) => n > 0n)).to.equal(true);

			await (maticX.connect(manager) as MaticX)
				.claimAssetRecallNonces()
				.catch(() => {

				});

			const noncesAfter = await Promise.all(
				shareAddrs.map((vs) => maticX.assetRecallNonces(vs))
			);
			expect(noncesAfter).to.deep.equal(noncesBefore);
			expect(await maticX.recallComplete()).to.equal(false);
			expect(await maticX.terminalRateLocked()).to.equal(false);
		});

		it("sets recallComplete = true after a successful claim", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, manager, stakeManager, stakeManagerGovernance } =
				fx;
			await (maticX.connect(manager) as MaticX).togglePause();
			await (
				maticX.connect(manager) as MaticX
			).bulkUnstakeAllValidators();
			await advanceUnbond(stakeManager, stakeManagerGovernance);

			expect(await maticX.recallComplete()).to.equal(false);
			await (maticX.connect(manager) as MaticX).claimAssetRecallNonces();
			expect(await maticX.recallComplete()).to.equal(true);

			const validatorIds = await fx.validatorRegistry.getValidators();
			for (const id of validatorIds) {
				const vs = await stakeManager.getValidatorContract(id);
				expect(await maticX.assetRecallNonces(vs)).to.equal(0n);
			}
		});
	});

	describe("finalizeTerminalRate", function () {
		it("reverts on the second call", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, manager } = fx;
			await pauseRecallAndFinalize(fx);
			await expect(
				(maticX.connect(manager) as MaticX).finalizeTerminalRate()
			).to.be.revertedWithCustomError(
				maticX,
				"TerminalRateAlreadyLocked"
			);
		});

		it("reverts with RecallClaimsNotComplete when finalize runs before claim", async function () {
			const { maticX, manager } = await loadFixture(deployFixture);
			await (maticX.connect(manager) as MaticX).togglePause();
			await (
				maticX.connect(manager) as MaticX
			).bulkUnstakeAllValidators();
			await expect(
				(maticX.connect(manager) as MaticX).finalizeTerminalRate()
			).to.be.revertedWithCustomError(maticX, "RecallClaimsNotComplete");
		});

		it("reverts EmptyContract when totalSupply is zero at finalize", async function () {

			const fx = await loadFixture(deployFixture);
			const {
				maticX,
				maticXAddress,
				manager,
				stakeManager,
				stakeManagerGovernance,
			} = fx;
			await (maticX.connect(manager) as MaticX).togglePause();
			await (
				maticX.connect(manager) as MaticX
			).bulkUnstakeAllValidators();
			await advanceUnbond(stakeManager, stakeManagerGovernance);
			await (maticX.connect(manager) as MaticX).claimAssetRecallNonces();

			const supplyBefore = await maticX.totalSupply();
			expect(supplyBefore).to.be.gt(0n);
			const supplySlot = await findScalarStorageSlot(
				maticXAddress,
				supplyBefore,
				() => maticX.totalSupply(),
				123456789n
			);
			await setStorageAt(maticXAddress, supplySlot, 0n);
			expect(await maticX.totalSupply()).to.equal(0n);

			await expect(
				(maticX.connect(manager) as MaticX).finalizeTerminalRate()
			).to.be.revertedWithCustomError(maticX, "EmptyContract");
		});

		it("reverts EmptyContract when polBalance is zero at finalize", async function () {

			const fx = await loadFixture(deployFixture);
			const {
				maticX,
				maticXAddress,
				manager,
				pol,
				stakeManager,
				stakeManagerGovernance,
			} = fx;
			await (maticX.connect(manager) as MaticX).togglePause();
			await (
				maticX.connect(manager) as MaticX
			).bulkUnstakeAllValidators();
			await advanceUnbond(stakeManager, stakeManagerGovernance);
			await (maticX.connect(manager) as MaticX).claimAssetRecallNonces();

			const polAddr = await pol.getAddress();
			const before = await pol.balanceOf(maticXAddress);
			expect(before).to.be.gt(0n);
			const balancesSlot = await findMappingSlot(
				polAddr,
				maticXAddress,
				async () => pol.balanceOf(maticXAddress),
				123456789n
			);
			await writeMappingValue(polAddr, balancesSlot, maticXAddress, 0n);
			expect(await pol.balanceOf(maticXAddress)).to.equal(0n);

			await expect(
				(maticX.connect(manager) as MaticX).finalizeTerminalRate()
			).to.be.revertedWithCustomError(maticX, "EmptyContract");
		});
	});

	describe("pushTerminalRateToL2", function () {
		it("reverts before freeze", async function () {
			const { maticX, manager } = await loadFixture(deployFixture);
			await expect(
				(maticX.connect(manager) as MaticX).pushTerminalRateToL2()
			).to.be.revertedWithCustomError(maticX, "TerminalRateNotLocked");
		});

		it("is idempotent (can be called twice after freeze)", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, manager } = fx;
			await pauseRecallAndFinalize(fx);
			await (maticX.connect(manager) as MaticX).pushTerminalRateToL2();
			await expect(
				(maticX.connect(manager) as MaticX).pushTerminalRateToL2()
			).to.emit(maticX, "TerminalRatePushedToL2");
		});

		it("emits the LIVE polBalance, not a snapshot from finalize", async function () {

			const fx = await loadFixture(deployFixture);
			const {
				maticX,
				maticXAddress,
				manager,
				pol,
				polygonTreasury,
			} = fx;
			await pauseRecallAndFinalize(fx);
			await (maticX.connect(manager) as MaticX).setInstantRedeemEnabled(
				true
			);

			const supply = await maticX.totalSupply();
			const polAtFinalize = await pol.balanceOf(maticXAddress);

			await expect(
				(maticX.connect(manager) as MaticX).pushTerminalRateToL2()
			)
				.to.emit(maticX, "TerminalRatePushedToL2")
				.withArgs(supply, polAtFinalize);

			const donation = ethers.parseUnits("7", 18);
			await pol
				.connect(polygonTreasury)
				.transfer(maticXAddress, donation);
			const polAfterDonation = await pol.balanceOf(maticXAddress);
			expect(polAfterDonation).to.equal(polAtFinalize + donation);

			await expect(
				(maticX.connect(manager) as MaticX).pushTerminalRateToL2()
			)
				.to.emit(maticX, "TerminalRatePushedToL2")
				.withArgs(supply, polAfterDonation);
		});
	});

	describe("setInstantRedeemEnabled", function () {
		it("reverts when enabling pre-freeze", async function () {
			const { maticX, manager } = await loadFixture(deployFixture);
			await expect(
				(maticX.connect(manager) as MaticX).setInstantRedeemEnabled(
					true
				)
			).to.be.revertedWithCustomError(maticX, "TerminalRateNotLocked");
		});

		it("reverts when disabling pre-freeze (gate is symmetric on terminalRateLocked)", async function () {
			const { maticX, manager } = await loadFixture(deployFixture);
			await expect(
				(maticX.connect(manager) as MaticX).setInstantRedeemEnabled(
					false
				)
			).to.be.revertedWithCustomError(maticX, "TerminalRateNotLocked");
		});

		it("admin can toggle on then off post-freeze", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, manager } = fx;
			await pauseRecallAndFinalize(fx);
			await (maticX.connect(manager) as MaticX).setInstantRedeemEnabled(
				true
			);
			expect(await maticX.instantRedeemEnabled()).to.equal(true);
			await (maticX.connect(manager) as MaticX).setInstantRedeemEnabled(
				false
			);
			expect(await maticX.instantRedeemEnabled()).to.equal(false);
		});
	});

	describe("instant-redeem path (requestWithdraw routes here once enabled)", function () {
		async function freezeAndEnable(
			fx: Awaited<ReturnType<typeof deployFixture>>
		) {
			await pauseRecallAndFinalize(fx);
			await (
				fx.maticX.connect(fx.manager) as MaticX
			).setInstantRedeemEnabled(true);
		}

		it("reverts Pausable: paused when redeem flag is off (falls through to legacy branch)", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, stakerA } = fx;
			await pauseRecallAndFinalize(fx);
			const shares = await maticX.balanceOf(stakerA.address);
			await expect(
				(maticX.connect(stakerA) as MaticX).requestWithdraw(shares)
			).to.be.revertedWith("Pausable: paused");
		});

		it("reverts Invalid amount on zero input regardless of redeem flag", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, stakerA } = fx;
			await freezeAndEnable(fx);
			await expect(
				(maticX.connect(stakerA) as MaticX).requestWithdraw(0n)
			).to.be.revertedWith("Invalid amount");
		});

		it("reverts on ERC20 burn underflow when caller holds no MATICx", async function () {

			const fx = await loadFixture(deployFixture);
			const { maticX, attacker } = fx;
			await freezeAndEnable(fx);
			expect(await maticX.balanceOf(attacker.address)).to.equal(0n);
			await expect(
				(maticX.connect(attacker) as MaticX).requestWithdraw(1n)
			).to.be.reverted;
		});

		it("reverts AmountInPolZero when terminalRate is degenerate (defensive)", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, maticXAddress, stakerA } = fx;
			await freezeAndEnable(fx);

			const rateSlot = await findScalarStorageSlot(
				maticXAddress,
				await maticX.terminalRate(),
				() => maticX.terminalRate(),
				123456789n
			);
			await setStorageAt(maticXAddress, rateSlot, 0n);
			expect(await maticX.terminalRate()).to.equal(0n);

			await expect(
				(maticX.connect(stakerA) as MaticX).requestWithdraw(1n)
			).to.be.revertedWithCustomError(maticX, "AmountInPolZero");
		});

		it("reverts InsufficientRecalledBalance when the pool is below the payout", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, maticXAddress, pol, stakerA } = fx;
			await freezeAndEnable(fx);

			const polAddr = await pol.getAddress();
			const polBalanceSlot = await findMappingSlot(
				polAddr,
				maticXAddress,
				() => pol.balanceOf(maticXAddress),
				123456789n
			);
			await writeMappingValue(polAddr, polBalanceSlot, maticXAddress, 0n);
			expect(await pol.balanceOf(maticXAddress)).to.equal(0n);

			const shares = await maticX.balanceOf(stakerA.address);
			await expect(
				(maticX.connect(stakerA) as MaticX).requestWithdraw(shares)
			).to.be.revertedWithCustomError(
				maticX,
				"InsufficientRecalledBalance"
			);
		});

		it("redeems the caller's full balance when amount == balance and zeroes their shares", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, maticXAddress, pol, stakerA } = fx;
			await freezeAndEnable(fx);

			const rate = await maticX.terminalRate();
			const sharesBefore = await maticX.balanceOf(stakerA.address);
			const recalledBefore = await pol.balanceOf(maticXAddress);
			const polBefore = await pol.balanceOf(stakerA.address);
			const expectedPol = (sharesBefore * rate) / TERMINAL_RATE_PRECISION;

			await (maticX.connect(stakerA) as MaticX).requestWithdraw(
				sharesBefore
			);

			expect(await maticX.balanceOf(stakerA.address)).to.equal(0n);
			expect(await pol.balanceOf(maticXAddress)).to.equal(
				recalledBefore - expectedPol
			);
			expect(await pol.balanceOf(stakerA.address)).to.equal(
				polBefore + expectedPol
			);
		});

		it("supports partial redemption (amount < balance)", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, maticXAddress, pol, stakerA } = fx;
			await freezeAndEnable(fx);

			const rate = await maticX.terminalRate();
			const sharesBefore = await maticX.balanceOf(stakerA.address);
			const half = sharesBefore / 2n;
			const recalledBefore = await pol.balanceOf(maticXAddress);
			const polBefore = await pol.balanceOf(stakerA.address);
			const expectedPol = (half * rate) / TERMINAL_RATE_PRECISION;

			await expect(
				(maticX.connect(stakerA) as MaticX).requestWithdraw(half)
			)
				.to.emit(maticX, "InstantClaimed")
				.withArgs(stakerA.address, half, expectedPol);

			expect(await maticX.balanceOf(stakerA.address)).to.equal(
				sharesBefore - half
			);
			expect(await pol.balanceOf(maticXAddress)).to.equal(
				recalledBefore - expectedPol
			);
			expect(await pol.balanceOf(stakerA.address)).to.equal(
				polBefore + expectedPol
			);
		});

		it("emits InstantClaimed with the supplied amount", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, stakerA } = fx;
			await freezeAndEnable(fx);

			const rate = await maticX.terminalRate();
			const shares = await maticX.balanceOf(stakerA.address);
			const expectedPol = (shares * rate) / TERMINAL_RATE_PRECISION;

			await expect(
				(maticX.connect(stakerA) as MaticX).requestWithdraw(shares)
			)
				.to.emit(maticX, "InstantClaimed")
				.withArgs(stakerA.address, shares, expectedPol);
		});
	});

	describe("sweepToCustody", function () {
		it("reverts before freeze", async function () {
			const { maticX, manager, pol, custody } =
				await loadFixture(deployFixture);
			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					await pol.getAddress(),
					custody.address
				)
			).to.be.revertedWithCustomError(maticX, "TerminalRateNotLocked");
		});

		it("reverts before the custody delay elapses", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, manager, pol, custody } = fx;
			await pauseRecallAndFinalize(fx);
			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					await pol.getAddress(),
					custody.address
				)
			).to.be.revertedWithCustomError(maticX, "CustodyDelayNotElapsed");
		});

		it("reverts on zero custody address", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, manager, pol } = fx;
			await pauseRecallAndFinalize(fx);
			await time.increase(CUSTODY_DELAY + 1n);
			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					await pol.getAddress(),
					ethers.ZeroAddress
				)
			).to.be.revertedWithCustomError(maticX, "ZeroAddress");
		});

		it("reverts on zero asset address", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, manager, custody } = fx;
			await pauseRecallAndFinalize(fx);
			await time.increase(CUSTODY_DELAY + 1n);
			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					ethers.ZeroAddress,
					custody.address
				)
			).to.be.revertedWithCustomError(maticX, "ZeroAddress");
		});

		it("moves the entire POL+MATIC balance via two per-asset sweeps", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, maticXAddress, manager, pol, matic, custody } = fx;
			await pauseRecallAndFinalize(fx);
			await time.increase(CUSTODY_DELAY + 1n);

			const polAddr = await pol.getAddress();
			const maticAddr = await matic.getAddress();
			const polBefore = await pol.balanceOf(maticXAddress);
			const maticBefore = await matic.balanceOf(maticXAddress);

			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					polAddr,
					custody.address
				)
			)
				.to.emit(maticX, "SweptToCustody")
				.withArgs(polAddr, custody.address, polBefore);

			expect(await pol.balanceOf(maticXAddress)).to.equal(0);
			expect(await pol.balanceOf(custody.address)).to.equal(polBefore);

			if (maticBefore > 0n) {
				await expect(
					(maticX.connect(manager) as MaticX).sweepToCustody(
						maticAddr,
						custody.address
					)
				)
					.to.emit(maticX, "SweptToCustody")
					.withArgs(maticAddr, custody.address, maticBefore);
				expect(await matic.balanceOf(maticXAddress)).to.equal(0);
				expect(await matic.balanceOf(custody.address)).to.equal(
					maticBefore
				);
			}
		});

		it("reverts ZeroAmount when the asset balance is zero", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, manager, matic, custody } = fx;
			await pauseRecallAndFinalize(fx);
			await time.increase(CUSTODY_DELAY + 1n);

			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					await matic.getAddress(),
					custody.address
				)
			).to.be.revertedWithCustomError(maticX, "ZeroAmount");
		});

		it("flips assetCustodied = true on first successful sweep", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, manager, pol, custody } = fx;
			await pauseRecallAndFinalize(fx);
			await time.increase(CUSTODY_DELAY + 1n);

			expect(await maticX.assetCustodied()).to.equal(false);
			await (maticX.connect(manager) as MaticX).sweepToCustody(
				await pol.getAddress(),
				custody.address
			);
			expect(await maticX.assetCustodied()).to.equal(true);
		});

		it("instant-redeem path reverts with AssetCustodied after a sweep, even with instantRedeemEnabled", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, manager, pol, stakerA, custody } = fx;
			await pauseRecallAndFinalize(fx);
			await (maticX.connect(manager) as MaticX).setInstantRedeemEnabled(
				true
			);
			await time.increase(CUSTODY_DELAY + 1n);

			await (maticX.connect(manager) as MaticX).sweepToCustody(
				await pol.getAddress(),
				custody.address
			);

			expect(await maticX.instantRedeemEnabled()).to.equal(true);
			expect(await maticX.assetCustodied()).to.equal(true);
			const shares = await maticX.balanceOf(stakerA.address);
			await expect(
				(maticX.connect(stakerA) as MaticX).requestWithdraw(shares)
			).to.be.revertedWithCustomError(maticX, "AssetCustodied");
		});

		it("succeeds at the exact sweepToCustodyTimestamp boundary (< vs <= check)", async function () {

			const fx = await loadFixture(deployFixture);
			const { maticX, manager, pol, custody } = fx;
			await pauseRecallAndFinalize(fx);

			const sweepTs = await maticX.sweepToCustodyTimestamp();
			await time.increaseTo(sweepTs);
			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					await pol.getAddress(),
					custody.address
				)
			).to.emit(maticX, "SweptToCustody");
		});

		it("sweeps non-zero MATIC dust to custody", async function () {

			const fx = await loadFixture(deployFixture);
			const { maticX, maticXAddress, manager, matic, custody } = fx;
			await pauseRecallAndFinalize(fx);
			await time.increase(CUSTODY_DELAY + 1n);

			const maticAddr = await matic.getAddress();
			const dust = ethers.parseUnits("123", 18);
			const balancesSlot = await findMappingSlot(
				maticAddr,
				maticXAddress,
				async () => matic.balanceOf(maticXAddress),
				123456789n
			);
			await writeMappingValue(
				maticAddr,
				balancesSlot,
				maticXAddress,
				dust
			);
			expect(await matic.balanceOf(maticXAddress)).to.equal(dust);

			const maticBeforeCustody = await matic.balanceOf(custody.address);
			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					maticAddr,
					custody.address
				)
			)
				.to.emit(maticX, "SweptToCustody")
				.withArgs(maticAddr, custody.address, dust);
			expect(await matic.balanceOf(maticXAddress)).to.equal(0n);
			expect(await matic.balanceOf(custody.address)).to.equal(
				maticBeforeCustody + dust
			);
		});

		it("allows a second sweep of a different asset after assetCustodied flips", async function () {

			const fx = await loadFixture(deployFixture);
			const { maticX, maticXAddress, manager, pol, matic, custody } = fx;
			await pauseRecallAndFinalize(fx);
			await time.increase(CUSTODY_DELAY + 1n);

			const maticAddr = await matic.getAddress();
			const dust = ethers.parseUnits("42", 18);
			const balancesSlot = await findMappingSlot(
				maticAddr,
				maticXAddress,
				async () => matic.balanceOf(maticXAddress),
				123456789n
			);
			await writeMappingValue(
				maticAddr,
				balancesSlot,
				maticXAddress,
				dust
			);

			const polAddr = await pol.getAddress();
			const polBefore = await pol.balanceOf(maticXAddress);

			await (maticX.connect(manager) as MaticX).sweepToCustody(
				polAddr,
				custody.address
			);
			expect(await maticX.assetCustodied()).to.equal(true);
			expect(await pol.balanceOf(custody.address)).to.equal(polBefore);

			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					maticAddr,
					custody.address
				)
			)
				.to.emit(maticX, "SweptToCustody")
				.withArgs(maticAddr, custody.address, dust);
			expect(await matic.balanceOf(maticXAddress)).to.equal(0n);
			expect(await matic.balanceOf(custody.address)).to.equal(dust);
		});

		it("sweeps an arbitrary ERC20 (not POL/MATIC) to custody", async function () {

			const fx = await loadFixture(deployFixture);
			const { maticX, maticXAddress, manager, custody } = fx;
			await pauseRecallAndFinalize(fx);
			await time.increase(CUSTODY_DELAY + 1n);

			const MockFactory = await ethers.getContractFactory("PolygonMock");
			const stray = await MockFactory.connect(manager).deploy();
			await stray.waitForDeployment();
			const strayAddr = await stray.getAddress();

			const amount = ethers.parseUnits("1000", 18);
			await stray.mintTo(maticXAddress, amount);
			expect(await stray.balanceOf(maticXAddress)).to.equal(amount);

			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					strayAddr,
					custody.address
				)
			)
				.to.emit(maticX, "SweptToCustody")
				.withArgs(strayAddr, custody.address, amount);

			expect(await stray.balanceOf(maticXAddress)).to.equal(0n);
			expect(await stray.balanceOf(custody.address)).to.equal(amount);
			expect(await maticX.assetCustodied()).to.equal(true);
		});
	});

	describe("Access control", function () {
		it("non-admin cannot call any sunset admin function", async function () {
			const { maticX, attacker, pol, custody } =
				await loadFixture(deployFixture);
			await expect(
				(maticX.connect(attacker) as MaticX).bulkUnstakeAllValidators()
			).to.be.reverted;
			await expect(
				(maticX.connect(attacker) as MaticX).claimAssetRecallNonces()
			).to.be.reverted;
			await expect(
				(maticX.connect(attacker) as MaticX).finalizeTerminalRate()
			).to.be.reverted;
			await expect(
				(maticX.connect(attacker) as MaticX).pushTerminalRateToL2()
			).to.be.reverted;
			await expect(
				(maticX.connect(attacker) as MaticX).setInstantRedeemEnabled(
					true
				)
			).to.be.reverted;
			await expect(
				(maticX.connect(attacker) as MaticX).sweepToCustody(
					await pol.getAddress(),
					custody.address
				)
			).to.be.reverted;
		});
	});

	describe("Pre-sunset claimWithdrawal during sunset", function () {
		it("user with a matured withdrawal request can still claim after pause and freeze", async function () {
			const fx = await loadFixture(deployFixture);
			const {
				maticX,
				manager,
				pol,
				stakerA,
				stakeManager,
				stakeManagerGovernance,
			} = fx;

			await (maticX.connect(stakerA) as MaticX).requestWithdraw(
				stakeAmount / 2n
			);
			const requests = await maticX.getUserWithdrawalRequests(
				stakerA.address
			);
			const { requestEpoch } = requests[0];

			await (maticX.connect(manager) as MaticX).togglePause();
			await (
				maticX.connect(manager) as MaticX
			).bulkUnstakeAllValidators();

			const withdrawalDelay = await stakeManager.withdrawalDelay();
			await stakeManager
				.connect(stakeManagerGovernance)
				.setCurrentEpoch(BigInt(requestEpoch) + withdrawalDelay + 1n);

			await (maticX.connect(manager) as MaticX).claimAssetRecallNonces();
			await (maticX.connect(manager) as MaticX).finalizeTerminalRate();

			const maticXAddress = await maticX.getAddress();
			const recalledBefore = await pol.balanceOf(maticXAddress);
			const polBeforeUser = await pol.balanceOf(stakerA.address);

			await (maticX.connect(stakerA) as MaticX).claimWithdrawal(0);

			expect(await pol.balanceOf(stakerA.address)).to.be.gt(
				polBeforeUser
			);
			expect(await pol.balanceOf(maticXAddress)).to.equal(recalledBefore);
		});
	});

	describe("togglePause one-way after recall", function () {
		it("reverts unpause with UnpauseLockedAfterRecall once recallInitiated", async function () {
			const { maticX, manager } = await loadFixture(deployFixture);
			await (maticX.connect(manager) as MaticX).togglePause();
			await (
				maticX.connect(manager) as MaticX
			).bulkUnstakeAllValidators();
			expect(await maticX.paused()).to.equal(true);
			expect(await maticX.recallInitiated()).to.equal(true);
			await expect(
				(maticX.connect(manager) as MaticX).togglePause()
			).to.be.revertedWithCustomError(maticX, "UnpauseLockedAfterRecall");
		});
	});

	describe("Oracle freeze during recall", function () {
		it("serves preFinalizeRate between bulkUnstake and finalize", async function () {
			const { maticX, manager } = await loadFixture(deployFixture);
			await (maticX.connect(manager) as MaticX).togglePause();
			await (
				maticX.connect(manager) as MaticX
			).bulkUnstakeAllValidators();

			const snap = await maticX.preFinalizeRate();
			expect(snap).to.be.gt(0n);

			const [polOut] = await maticX.convertMaticXToPOL(
				TERMINAL_RATE_PRECISION
			);
			expect(polOut).to.equal(snap);
		});
	});

	describe("Recall-gated setters", function () {
		it("setValidatorRegistry reverts with RecallAlreadyInitiated post-bulkUnstake", async function () {
			const { maticX, manager, validatorRegistry } =
				await loadFixture(deployFixture);
			await (maticX.connect(manager) as MaticX).togglePause();
			await (
				maticX.connect(manager) as MaticX
			).bulkUnstakeAllValidators();
			await expect(
				(maticX.connect(manager) as MaticX).setValidatorRegistry(
					await validatorRegistry.getAddress()
				)
			).to.be.revertedWithCustomError(maticX, "RecallAlreadyInitiated");
		});

		it("setFxStateRootTunnel reverts with RecallAlreadyInitiated post-bulkUnstake", async function () {
			const { maticX, manager, fxStateRootTunnel } =
				await loadFixture(deployFixture);
			await (maticX.connect(manager) as MaticX).togglePause();
			await (
				maticX.connect(manager) as MaticX
			).bulkUnstakeAllValidators();
			await expect(
				(maticX.connect(manager) as MaticX).setFxStateRootTunnel(
					await fxStateRootTunnel.getAddress()
				)
			).to.be.revertedWithCustomError(maticX, "RecallAlreadyInitiated");
		});
	});

	describe("Oracle three-tier behavior", function () {
		it("pre-recall: serves the live computed rate from validator stakes", async function () {
			const { maticX } = await loadFixture(deployFixture);

			const supply = await maticX.totalSupply();
			const [polFor1e18, returnedSupply, returnedPooled] =
				await maticX.convertMaticXToPOL(TERMINAL_RATE_PRECISION);

			expect(returnedSupply).to.equal(supply);
			expect(returnedPooled).to.be.gt(0n);
			expect(polFor1e18).to.be.gt(0n);
		});

		it("during recall: preFinalizeRate matches the pre-recall live rate exactly", async function () {
			const { maticX, manager } = await loadFixture(deployFixture);

			const [liveRateBefore] = await maticX.convertMaticXToPOL(
				TERMINAL_RATE_PRECISION
			);

			await (maticX.connect(manager) as MaticX).togglePause();
			await (
				maticX.connect(manager) as MaticX
			).bulkUnstakeAllValidators();

			const snap = await maticX.preFinalizeRate();
			expect(snap).to.equal(liveRateBefore);
		});

		it("post-finalize: serves the locked terminalRate (3rd tier)", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX } = fx;
			await pauseRecallAndFinalize(fx);

			const terminal = await maticX.terminalRate();
			expect(terminal).to.be.gt(0n);

			const [polFor1e18, totalShares, totalPooled] =
				await maticX.convertMaticXToPOL(TERMINAL_RATE_PRECISION);
			expect(polFor1e18).to.equal(terminal);
			expect(totalShares).to.be.gt(0n);
			expect(
				(totalPooled * TERMINAL_RATE_PRECISION) / totalShares
			).to.equal(terminal);
		});

		it("convertPOLToMaticX mirrors the 3-tier oracle (during recall + post-finalize)", async function () {
			const { maticX, manager } = await loadFixture(deployFixture);

			const [livePre] = await maticX.convertPOLToMaticX(
				TERMINAL_RATE_PRECISION
			);
			expect(livePre).to.be.gt(0n);

			await (maticX.connect(manager) as MaticX).togglePause();
			await (
				maticX.connect(manager) as MaticX
			).bulkUnstakeAllValidators();

			const snap = await maticX.preFinalizeRate();
			const [maticXOutDuringRecall, totalShares, totalPooled] =
				await maticX.convertPOLToMaticX(TERMINAL_RATE_PRECISION);
			expect(maticXOutDuringRecall).to.equal(
				(TERMINAL_RATE_PRECISION * TERMINAL_RATE_PRECISION) / snap
			);
			expect(totalShares).to.be.gt(0n);
			expect(
				(totalPooled * TERMINAL_RATE_PRECISION) / totalShares
			).to.equal(snap);
		});

		it("POL donations during recall do NOT move the oracle (manipulation immunity)", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, manager, pol, stakerA } = fx;

			await (maticX.connect(manager) as MaticX).togglePause();
			await (
				maticX.connect(manager) as MaticX
			).bulkUnstakeAllValidators();

			const snapBefore = await maticX.preFinalizeRate();
			const [oracleBefore] = await maticX.convertMaticXToPOL(
				TERMINAL_RATE_PRECISION
			);
			expect(oracleBefore).to.equal(snapBefore);

			const donation = stakeAmount;
			expect(await pol.balanceOf(stakerA.address)).to.be.gte(donation);
			await pol
				.connect(stakerA)
				.transfer(await maticX.getAddress(), donation);

			const [oracleAfter] = await maticX.convertMaticXToPOL(
				TERMINAL_RATE_PRECISION
			);
			expect(oracleAfter).to.equal(oracleBefore);
			expect(await maticX.preFinalizeRate()).to.equal(snapBefore);
		});

		it("POL donations post-finalize do NOT move the oracle either", async function () {
			const fx = await loadFixture(deployFixture);
			const { maticX, pol, stakerA } = fx;
			await pauseRecallAndFinalize(fx);

			const terminalBefore = await maticX.terminalRate();
			const [oracleBefore] = await maticX.convertMaticXToPOL(
				TERMINAL_RATE_PRECISION
			);
			expect(oracleBefore).to.equal(terminalBefore);

			const donation = stakeAmount;
			expect(await pol.balanceOf(stakerA.address)).to.be.gte(donation);
			await pol
				.connect(stakerA)
				.transfer(await maticX.getAddress(), donation);

			const [oracleAfter] = await maticX.convertMaticXToPOL(
				TERMINAL_RATE_PRECISION
			);
			expect(oracleAfter).to.equal(oracleBefore);
			expect(await maticX.terminalRate()).to.equal(terminalBefore);
		});

		it("during-recall sentinel: rate==1 when preFinalizeRate is 0", async function () {

			const fx = await loadFixture(deployFixture);
			const { maticX, maticXAddress, manager } = fx;
			await (maticX.connect(manager) as MaticX).togglePause();
			await (
				maticX.connect(manager) as MaticX
			).bulkUnstakeAllValidators();

			const before = await maticX.preFinalizeRate();
			expect(before).to.be.gt(0n);
			const slot = await findScalarStorageSlot(
				maticXAddress,
				before,
				() => maticX.preFinalizeRate(),
				123456789n
			);
			await setStorageAt(maticXAddress, slot, 0n);
			expect(await maticX.preFinalizeRate()).to.equal(0n);

			const [polFor1e18, totalShares, totalPooled] =
				await maticX.convertMaticXToPOL(TERMINAL_RATE_PRECISION);
			expect(polFor1e18).to.equal(1n);
			expect(totalShares).to.be.gt(0n);
			expect(
				(totalPooled * TERMINAL_RATE_PRECISION) / totalShares
			).to.equal(1n);
		});

		it("post-finalize sentinel: rate==1 when terminalRate is 0", async function () {

			const fx = await loadFixture(deployFixture);
			const { maticX, maticXAddress } = fx;
			await pauseRecallAndFinalize(fx);

			const before = await maticX.terminalRate();
			expect(before).to.be.gt(0n);
			const slot = await findScalarStorageSlot(
				maticXAddress,
				before,
				() => maticX.terminalRate(),
				123456789n
			);
			await setStorageAt(maticXAddress, slot, 0n);
			expect(await maticX.terminalRate()).to.equal(0n);

			const [polFor1e18, totalShares, totalPooled] =
				await maticX.convertMaticXToPOL(TERMINAL_RATE_PRECISION);
			expect(polFor1e18).to.equal(1n);
			expect(totalShares).to.be.gt(0n);
			expect(
				(totalPooled * TERMINAL_RATE_PRECISION) / totalShares
			).to.equal(1n);
		});
	});

	describe("setCustodyDelay (sweep window setter)", function () {
		it("updates sweepToCustodyTimestamp = block.timestamp + _custodyDelay and emits the absolute value", async function () {
			const { maticX, manager } = await loadFixture(deployFixture);
			const newDelay = 7n * 24n * 60n * 60n;
			const tx = await (
				maticX.connect(manager) as MaticX
			).setCustodyDelay(newDelay);
			if (tx.blockNumber === null) {
				throw new Error("setCustodyDelay tx has no blockNumber");
			}
			const block = await ethers.provider.getBlock(tx.blockNumber);
			if (!block) throw new Error("block not found");
			const expectedTs = BigInt(block.timestamp) + newDelay;
			await expect(tx)
				.to.emit(maticX, "SetCustodyDelay")
				.withArgs(expectedTs);
			expect(await maticX.sweepToCustodyTimestamp()).to.equal(expectedTs);
		});

		it("reverts with ZeroCustodyDelay on zero delay", async function () {
			const { maticX, manager } = await loadFixture(deployFixture);
			await expect(
				(maticX.connect(manager) as MaticX).setCustodyDelay(0)
			).to.be.revertedWithCustomError(maticX, "ZeroCustodyDelay");
		});

		it("reverts for non-admin", async function () {
			const { maticX, attacker } = await loadFixture(deployFixture);
			await expect(
				(maticX.connect(attacker) as MaticX).setCustodyDelay(1n)
			).to.be.reverted;
		});

		it("sweepToCustody reverts when sweepToCustodyTimestamp is unset (footgun guard)", async function () {

			const fx = await loadFixture(deployFixture);
			const { maticX, manager, pol, custody } = fx;
			await pauseRecallAndFinalize(fx);

			const slot = await findScalarStorageSlot(
				await maticX.getAddress(),
				await maticX.sweepToCustodyTimestamp(),
				() => maticX.sweepToCustodyTimestamp(),
				123456789n
			);
			await setStorageAt(await maticX.getAddress(), slot, 0n);
			expect(await maticX.sweepToCustodyTimestamp()).to.equal(0n);

			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					await pol.getAddress(),
					custody.address
				)
			).to.be.revertedWithCustomError(maticX, "CustodyDelayNotElapsed");
		});

		it("sweepToCustody respects an admin-shortened delay (post-finalize reconfig)", async function () {

			const fx = await loadFixture(deployFixture);
			const { maticX, manager, pol, custody } = fx;
			await pauseRecallAndFinalize(fx);

			const shortDelay = 60n * 60n;
			await (maticX.connect(manager) as MaticX).setCustodyDelay(
				shortDelay
			);
			const sweepTs = await maticX.sweepToCustodyTimestamp();
			const polAddr = await pol.getAddress();

			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					polAddr,
					custody.address
				)
			).to.be.revertedWithCustomError(maticX, "CustodyDelayNotElapsed");

			await time.increaseTo(sweepTs);
			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					polAddr,
					custody.address
				)
			).to.emit(maticX, "SweptToCustody");
		});

		it("sweepToCustody respects an admin-extended delay (reconfig restarts the clock)", async function () {

			const fx = await loadFixture(deployFixture);
			const { maticX, manager, pol, custody } = fx;
			await pauseRecallAndFinalize(fx);

			const originalSweepTs = await maticX.sweepToCustodyTimestamp();

			await time.increaseTo(originalSweepTs + 100n);

			const extendedDelay = 5n * 365n * 24n * 60n * 60n;
			await (maticX.connect(manager) as MaticX).setCustodyDelay(
				extendedDelay
			);

			const newSweepTs = await maticX.sweepToCustodyTimestamp();
			expect(newSweepTs).to.be.gt(originalSweepTs);
			const polAddr = await pol.getAddress();
			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					polAddr,
					custody.address
				)
			).to.be.revertedWithCustomError(maticX, "CustodyDelayNotElapsed");

			await time.increaseTo(newSweepTs);
			await expect(
				(maticX.connect(manager) as MaticX).sweepToCustody(
					polAddr,
					custody.address
				)
			).to.emit(maticX, "SweptToCustody");
		});
	});
});
