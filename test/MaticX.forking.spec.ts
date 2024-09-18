import {
	loadFixture,
	reset,
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
import { extractEnvironmentVariables } from "../utils/environment";
import { generateRandomAddress } from "../utils/account";

const envVars = extractEnvironmentVariables();

describe("MaticX (Forking)", function () {
	const stakeAmount = ethers.utils.parseUnits("100", 18);
	const totalStakeAmount = stakeAmount.mul(3);

	async function deployFixture(callInitializeV2 = true) {
		await reset(envVars.ROOT_CHAIN_RPC, envVars.FORKING_ROOT_BLOCK_NUMBER);

		// EOAs
		const manager = await impersonateAccount(
			"0x80A43dd35382C4919991C5Bca7f46Dd24Fde4C67"
		);
		const maticHolder = await impersonateAccount(
			"0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0"
		);
		const stakeManagerGovernance = await impersonateAccount(
			"0x6e7a5820baD6cebA8Ef5ea69c0C92EbbDAc9CE48"
		);
		const treasury = manager;
		const [executor, stakerA, stakerB] = await ethers.getSigners();
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
			treasury.address,
		])) as MaticX;

		// Contract initializations
		const validatorIds = await validatorRegistry.getValidators();
		const preferredDepositValidatorId = validatorIds[0];
		validatorRegistry.setPreferredDepositValidatorId(
			preferredDepositValidatorId
		);

		const preferredWithdrawalValidatorId = validatorIds[0];
		validatorRegistry.setPreferredWithdrawalValidatorId(
			preferredWithdrawalValidatorId
		);

		await fxStateRootTunnel.connect(manager).setMaticX(maticX.address);

		await maticX
			.connect(manager)
			.setFxStateRootTunnel(fxStateRootTunnel.address);

		if (callInitializeV2) {
			await maticX.connect(manager).initializeV2(pol.address);
		}

		const defaultAdminRole = await maticX.DEFAULT_ADMIN_ROLE();
		const botRole = await maticX.BOT();

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
			treasury,
			maticHolder,
			stakeManagerGovernance,
			executor,
			stakerA,
			stakerB,
			stakers,
			defaultAdminRole,
			botRole,
			validatorIds,
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

	describe("Deploy the contract", function () {
		describe("Negative", function () {
			it("Should revert with the right error if passing the zero validator registry address", async function () {
				const { stakeManager, matic, manager, treasury } =
					await loadFixture(deployFixture);

				const MaticX = await ethers.getContractFactory("MaticX");
				const promise = upgrades.deployProxy(MaticX, [
					ethers.constants.AddressZero,
					stakeManager.address,
					matic.address,
					manager.address,
					treasury.address,
				]);
				await expect(promise).to.be.revertedWith(
					"Zero validator registry address"
				);
			});

			it("Should revert with the right error if passing the zero stake manager address", async function () {
				const { validatorRegistry, matic, manager, treasury } =
					await loadFixture(deployFixture);

				const MaticX = await ethers.getContractFactory("MaticX");
				const promise = upgrades.deployProxy(MaticX, [
					validatorRegistry.address,
					ethers.constants.AddressZero,
					matic.address,
					manager.address,
					treasury.address,
				]);
				await expect(promise).to.be.revertedWith(
					"Zero stake manager address"
				);
			});

			it("Should revert with the right error if passing the zero matic token address", async function () {
				const { validatorRegistry, stakeManager, manager, treasury } =
					await loadFixture(deployFixture);

				const MaticX = await ethers.getContractFactory("MaticX");
				const promise = upgrades.deployProxy(MaticX, [
					validatorRegistry.address,
					stakeManager.address,
					ethers.constants.AddressZero,
					manager.address,
					treasury.address,
				]);
				await expect(promise).to.be.revertedWith(
					"Zero matic token address"
				);
			});

			it("Should revert with the right error if passing the zero manager address", async function () {
				const { validatorRegistry, stakeManager, matic, treasury } =
					await loadFixture(deployFixture);

				const MaticX = await ethers.getContractFactory("MaticX");
				const promise = upgrades.deployProxy(MaticX, [
					validatorRegistry.address,
					stakeManager.address,
					matic.address,
					ethers.constants.AddressZero,
					treasury.address,
				]);
				await expect(promise).to.be.revertedWith(
					"Zero manager address"
				);
			});

			it("Should revert with the right error if passing the zero treasury address", async function () {
				const { validatorRegistry, stakeManager, matic, manager } =
					await loadFixture(deployFixture);

				const MaticX = await ethers.getContractFactory("MaticX");
				const promise = upgrades.deployProxy(MaticX, [
					validatorRegistry.address,
					stakeManager.address,
					matic.address,
					manager.address,
					ethers.constants.AddressZero,
				]);
				await expect(promise).to.be.revertedWith(
					"Zero treasury address"
				);
			});

			it("Should revert with the right error if reinitializing", async function () {
				const {
					maticX,
					validatorRegistry,
					stakeManager,
					matic,
					manager,
					treasury,
				} = await loadFixture(deployFixture);

				const promise = maticX.initialize(
					validatorRegistry.address,
					stakeManager.address,
					matic.address,
					manager.address,
					treasury.address
				);
				await expect(promise).to.be.revertedWith(
					"Initializable: contract is already initialized"
				);
			});
		});

		describe("Positive", function () {
			it("Should return the default admin role set for the manager", async function () {
				const { maticX, manager, defaultAdminRole } =
					await loadFixture(deployFixture);

				const hasRole = await maticX.hasRole(
					defaultAdminRole,
					manager.address
				);
				expect(hasRole).to.be.true;
			});

			it("Should return the right paused status", async function () {
				const { maticX } = await loadFixture(deployFixture);

				const paused = await maticX.paused();
				expect(paused).to.be.false;
			});

			it("Should return the right treasury", async function () {
				const { maticX, treasury } = await loadFixture(deployFixture);

				const currentTreasuryAddress = await maticX.treasury();
				expect(currentTreasuryAddress).to.equal(treasury.address);
			});

			it("Should return the right version", async function () {
				const { maticX } = await loadFixture(deployFixture);

				const currentVersion = await maticX.version();
				expect(currentVersion).to.equal("");
			});

			it("Should return the right fee percent", async function () {
				const { maticX } = await loadFixture(deployFixture);

				const currentFeePercent = await maticX.feePercent();
				expect(currentFeePercent).to.equal(5);
			});

			it("Should return the fx state root tunnel address", async function () {
				const { maticX, fxStateRootTunnel } =
					await loadFixture(deployFixture);

				const currentFxStateRootTunnel =
					await maticX.fxStateRootTunnel();
				expect(currentFxStateRootTunnel).to.equal(
					fxStateRootTunnel.address
				);
			});

			it("Should return the right contract addresses", async function () {
				const { maticX, stakeManager, matic, validatorRegistry, pol } =
					await loadFixture(deployFixture);

				const [
					stakeManagerAddress,
					maticAddress,
					validatorRegistryAddress,
					polAddress,
				] = await maticX.getContracts();
				expect(stakeManagerAddress).to.equal(stakeManager.address);
				expect(maticAddress).to.equal(matic.address);
				expect(validatorRegistryAddress).to.equal(
					validatorRegistry.address
				);
				expect(polAddress).to.equal(pol.address);
			});
		});
	});

	describe("Upgrade the contract", function () {
		describe("Checks", function () {
			it("Should return a new address of the implementation if extended", async function () {
				const { maticX } = await loadFixture(deployFixture);

				const initialImplementationAddress =
					await upgrades.erc1967.getImplementationAddress(
						maticX.address
					);

				const ExtendedMaticXMock =
					await ethers.getContractFactory("ExtendedMaticXMock");
				await upgrades.upgradeProxy(maticX, ExtendedMaticXMock);

				const currentImplementationAddress =
					await upgrades.erc1967.getImplementationAddress(
						maticX.address
					);
				expect(initialImplementationAddress).not.to.equal(
					currentImplementationAddress
				);
			});

			it("Should return the same address of the implementation if not extended", async function () {
				const { maticX } = await loadFixture(deployFixture);

				const initialImplementationAddress =
					await upgrades.erc1967.getImplementationAddress(
						maticX.address
					);

				const MaticX = await ethers.getContractFactory("MaticX");
				await upgrades.upgradeProxy(maticX, MaticX);

				const currentImplementationAddress =
					await upgrades.erc1967.getImplementationAddress(
						maticX.address
					);
				expect(currentImplementationAddress).to.equal(
					initialImplementationAddress
				);
			});
		});
	});

	describe("Fallback", function () {
		describe("Negative", function () {
			it("Should revert if calling a non existing method", async function () {
				const { maticX, executor } = await loadFixture(deployFixture);

				const iface = new ethers.utils.Interface([
					"function foobar(uint256)",
				]);
				const promise = executor.sendTransaction({
					to: maticX.address,
					data: iface.encodeFunctionData("foobar", [1]),
				});
				await expect(promise).to.be.reverted;
			});

			it("Should revert if sending arbitrary data", async function () {
				const { maticX, executor } = await loadFixture(deployFixture);

				const promise = executor.sendTransaction({
					to: maticX.address,
					data: "0x01",
				});
				await expect(promise).to.be.reverted;
			});

			it("Should revert if sending no data", async function () {
				const { maticX, executor } = await loadFixture(deployFixture);

				const promise = executor.sendTransaction({
					to: maticX.address,
				});
				await expect(promise).to.be.reverted;
			});
		});
	});

	describe("Grant a role", function () {
		describe("Negative", function () {
			it("Should revert with the right error if called by a non admin", async function () {
				const { maticX, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = maticX
					.connect(executor)
					.grantRole(defaultAdminRole, executor.address);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the RoleGranted event", async function () {
				const { maticX, manager, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = maticX
					.connect(manager)
					.grantRole(defaultAdminRole, executor.address);
				await expect(promise)
					.to.emit(maticX, "RoleGranted")
					.withArgs(
						defaultAdminRole,
						executor.address,
						manager.address
					);
			});

			it("Should return the right status of the granted role", async function () {
				const { maticX, manager, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				await maticX
					.connect(manager)
					.grantRole(defaultAdminRole, executor.address);

				const hasRole = await maticX.hasRole(
					defaultAdminRole,
					executor.address
				);
				expect(hasRole).to.be.true;
			});
		});
	});

	describe("Revoke a role", function () {
		describe("Negative", function () {
			it("Should revert with the right error if called by a non admin", async function () {
				const { maticX, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = maticX
					.connect(executor)
					.revokeRole(defaultAdminRole, executor.address);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the RoleRevoked event", async function () {
				const { maticX, manager, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				await maticX
					.connect(manager)
					.grantRole(defaultAdminRole, executor.address);

				const promise = maticX
					.connect(manager)
					.revokeRole(defaultAdminRole, executor.address);
				await expect(promise)
					.to.emit(maticX, "RoleRevoked")
					.withArgs(
						defaultAdminRole,
						executor.address,
						manager.address
					);
			});

			it("Should return the right status of the revoked role", async function () {
				const { maticX, manager, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				await maticX
					.connect(manager)
					.grantRole(defaultAdminRole, executor.address);

				await maticX
					.connect(manager)
					.revokeRole(defaultAdminRole, executor.address);

				const hasRole = await maticX.hasRole(
					defaultAdminRole,
					executor.address
				);
				expect(hasRole).to.be.false;
			});
		});
	});

	describe("Renounce a role", function () {
		describe("Negative", function () {
			it("Should revert with the right error if called by a non admin", async function () {
				const { maticX, manager, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = maticX
					.connect(manager)
					.renounceRole(defaultAdminRole, executor.address);
				await expect(promise).to.be.revertedWith(
					"AccessControl: can only renounce roles for self"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the RoleRevoked event", async function () {
				const { maticX, manager, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = maticX
					.connect(manager)
					.renounceRole(defaultAdminRole, manager.address);
				await expect(promise)
					.to.emit(maticX, "RoleRevoked")
					.withArgs(
						defaultAdminRole,
						manager.address,
						manager.address
					);
			});

			it("Should return the right status of the revoked role", async function () {
				const { maticX, manager, defaultAdminRole } =
					await loadFixture(deployFixture);

				await maticX
					.connect(manager)
					.renounceRole(defaultAdminRole, manager.address);

				const hasRole = await maticX.hasRole(
					defaultAdminRole,
					manager.address
				);
				expect(hasRole).to.be.false;
			});
		});
	});

	describe("Toggle pause", function () {
		describe("Negative", function () {
			it("Should revert with the right error if called by a non admin", async function () {
				const { maticX, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = maticX.connect(executor).togglePause();
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the Paused event if pausing", async function () {
				const { maticX, manager } = await loadFixture(deployFixture);

				const promise = maticX.connect(manager).togglePause();
				await expect(promise)
					.to.emit(maticX, "Paused")
					.withArgs(manager.address);
			});

			it("Should emit the Unpaused event if pausing", async function () {
				const { maticX, manager } = await loadFixture(deployFixture);

				await maticX.connect(manager).togglePause();

				const promise = maticX.connect(manager).togglePause();
				await expect(promise)
					.to.emit(maticX, "Unpaused")
					.withArgs(manager.address);
			});

			it("Should return the right paused status if toggling once", async function () {
				const { maticX, manager } = await loadFixture(deployFixture);

				await maticX.connect(manager).togglePause();

				const paused = await maticX.paused();
				expect(paused).to.be.true;
			});

			it("Should return the right paused status if toggling twice", async function () {
				const { maticX, manager } = await loadFixture(deployFixture);

				await maticX.connect(manager).togglePause();
				await maticX.connect(manager).togglePause();

				const paused = await maticX.paused();
				expect(paused).to.be.false;
			});
		});
	});

	describe("Initialize V2", function () {
		describe("Negative", function () {
			it("Should revert with the right error if reinitializing", async function () {
				const { maticX, pol, manager } = await loadFixture(
					deployFixture.bind(null, false)
				);

				await maticX.connect(manager).initializeV2(pol.address);

				const promise = maticX
					.connect(manager)
					.initializeV2(pol.address);
				await expect(promise).to.be.revertedWith(
					"Initializable: contract is already initialized"
				);
			});

			it("Should revert with the right error if called by a non admin", async function () {
				const { maticX, pol, executor, defaultAdminRole } =
					await loadFixture(deployFixture.bind(null, false));

				const promise = maticX
					.connect(executor)
					.initializeV2(pol.address);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing the zero pol token address", async function () {
				const { maticX, manager } = await loadFixture(
					deployFixture.bind(null, false)
				);

				const promise = maticX
					.connect(manager)
					.initializeV2(ethers.constants.AddressZero);
				await expect(promise).to.be.revertedWith(
					"Zero POL token address"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the Initialized and RoleAdminChanged events", async function () {
				const { maticX, pol, manager, botRole, defaultAdminRole } =
					await loadFixture(deployFixture.bind(null, false));

				const promise = maticX
					.connect(manager)
					.initializeV2(pol.address);
				await expect(promise)
					.to.emit(maticX, "Initialized")
					.withArgs(2)
					.and.to.emit(maticX, "RoleAdminChanged")
					.withArgs(botRole, defaultAdminRole, defaultAdminRole);
			});

			it("Should return the right contract addresses", async function () {
				const {
					maticX,
					stakeManager,
					matic,
					validatorRegistry,
					pol,
					manager,
				} = await loadFixture(deployFixture.bind(null, false));

				await maticX.connect(manager).initializeV2(pol.address);

				const [
					stakeManagerAddress,
					maticAddress,
					validatorRegistryAddress,
					polAddress,
				] = await maticX.getContracts();
				expect(stakeManagerAddress).to.equal(stakeManager.address);
				expect(maticAddress).to.equal(matic.address);
				expect(validatorRegistryAddress).to.equal(
					validatorRegistry.address
				);
				expect(polAddress).to.equal(pol.address);
			});

			it("Should return the right allowance of the POL token for the StakeManager contract", async function () {
				const { maticX, stakeManager, pol, manager } =
					await loadFixture(deployFixture.bind(null, false));

				await maticX.connect(manager).initializeV2(pol.address);

				const currentAllowance = await pol.allowance(
					maticX.address,
					stakeManager.address
				);
				expect(currentAllowance).to.equal(ethers.constants.MaxUint256);
			});
		});
	});

	describe("Submit Matic", function () {
		describe("Negative", function () {
			it("Should revert with the right error if paused", async function () {
				const { maticX, manager, stakerA } =
					await loadFixture(deployFixture);

				await maticX.connect(manager).togglePause();

				const promise = maticX.connect(stakerA).submit(stakeAmount);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

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

			it("Should the right Matic and POL token balances", async function () {
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
					await maticX.getTotalStakeAcrossAllValidators();
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
			it("Should revert with the right error if paused", async function () {
				const { maticX, manager, stakerA } =
					await loadFixture(deployFixture);

				await maticX.connect(manager).togglePause();

				const promise = maticX.connect(stakerA).submitPOL(stakeAmount);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

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

			it("Should the right POL token balances", async function () {
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
					await maticX.getTotalStakeAcrossAllValidators();
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

	describe("Request a withdrawal", function () {
		describe("Negative", function () {
			it("Should revert with the right error if paused", async function () {
				const { maticX, manager, stakerA } =
					await loadFixture(deployFixture);

				await maticX.connect(manager).togglePause();

				const promise = maticX
					.connect(stakerA)
					.requestWithdraw(stakeAmount);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

			it("Should revert with the right error if requesting the zero amount", async function () {
				const { maticX, pol, stakerA } =
					await loadFixture(deployFixture);

				await pol.connect(stakerA).approve(maticX.address, stakeAmount);
				await maticX.connect(stakerA).submitPOL(stakeAmount);

				const promise = maticX.connect(stakerA).requestWithdraw(0);
				await expect(promise).to.be.revertedWith("Invalid amount");
			});

			it("Should revert with the right error if requesting a higher amount than staked before", async function () {
				const { maticX, pol, stakerA } =
					await loadFixture(deployFixture);

				await pol.connect(stakerA).approve(maticX.address, stakeAmount);
				await maticX.connect(stakerA).submitPOL(stakeAmount);

				const promise = maticX
					.connect(stakerA)
					.requestWithdraw(stakeAmount.add(1));
				await expect(promise).to.be.revertedWith(
					"ERC20: burn amount exceeds balance"
				);
			});

			it("Should revert with the right error if having MaticX shares transferred from the current staker", async function () {
				const { maticX, pol, stakerA, stakerB } =
					await loadFixture(deployFixture);

				await pol.connect(stakerA).approve(maticX.address, stakeAmount);
				await maticX.connect(stakerA).submitPOL(stakeAmount);

				await maticX.connect(stakerA).transfer(stakerB.address, 1);

				const promise = maticX
					.connect(stakerA)
					.requestWithdraw(stakeAmount);
				await expect(promise).to.be.revertedWith(
					"ERC20: burn amount exceeds balance"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the RequestWithdraw and Transfer events", async function () {
				const { maticX, pol, stakerA, stakers } =
					await loadFixture(deployFixture);

				for (const staker of stakers) {
					await pol
						.connect(staker)
						.approve(maticX.address, stakeAmount);
					await maticX.connect(staker).submitPOL(stakeAmount);
				}

				const promise = maticX
					.connect(stakerA)
					.requestWithdraw(stakeAmount);
				await expect(promise)
					.to.emit(maticX, "RequestWithdraw")
					.withArgs(
						stakerA.address,
						totalStakeAmount,
						totalStakeAmount
					)
					.and.to.emit(maticX, "Transfer")
					.withArgs(
						stakerA.address,
						ethers.constants.AddressZero,
						stakeAmount
					);
			});

			it("Should emit the RequestWithraw event if transferring extra MaticX shares to the current staker", async function () {
				const { maticX, pol, stakerA, stakerB, stakers } =
					await loadFixture(deployFixture);

				for (const staker of stakers) {
					await pol
						.connect(staker)
						.approve(maticX.address, stakeAmount);
					await maticX.connect(staker).submitPOL(stakeAmount);
				}

				await maticX
					.connect(stakerB)
					.transfer(stakerA.address, stakeAmount);
				const totalStakeAmount = stakeAmount.mul(2);

				const promise = maticX
					.connect(stakerA)
					.requestWithdraw(totalStakeAmount);
				await expect(promise)
					.to.emit(maticX, "RequestWithdraw")
					.withArgs(
						stakerA.address,
						totalStakeAmount,
						totalStakeAmount
					);
			});

			it("Should emit the RequestWithraw event if changing a preferred withdrawal validator id", async function () {
				const {
					maticX,
					pol,
					validatorRegistry,
					stakerA,
					validatorIds,
				} = await loadFixture(deployFixture);

				await pol.connect(stakerA).approve(maticX.address, stakeAmount);
				await maticX.connect(stakerA).submitPOL(stakeAmount);

				const preferredWithdrawalValidatorId = validatorIds[1];
				await validatorRegistry.setPreferredWithdrawalValidatorId(
					preferredWithdrawalValidatorId
				);

				const promise = maticX
					.connect(stakerA)
					.requestWithdraw(stakeAmount);
				await expect(promise)
					.to.emit(maticX, "RequestWithdraw")
					.withArgs(stakerA.address, stakeAmount, stakeAmount);
			});

			it("Should return the right staker's withdrawal requests", async function () {
				const {
					maticX,
					pol,
					stakeManager,
					stakerA,
					preferredDepositValidatorId,
				} = await loadFixture(deployFixture);

				await pol.connect(stakerA).approve(maticX.address, stakeAmount);
				await maticX.connect(stakerA).submitPOL(stakeAmount);

				const validatorShareAddress =
					await stakeManager.getValidatorContract(
						preferredDepositValidatorId
					);

				const initialWithdrawalRequests =
					await maticX.getUserWithdrawalRequests(stakerA.address);

				await maticX.connect(stakerA).requestWithdraw(stakeAmount);

				const currentWithdrawalRequests =
					await maticX.getUserWithdrawalRequests(stakerA.address);
				expect(currentWithdrawalRequests.length).not.to.equal(
					initialWithdrawalRequests.length
				);
				expect(currentWithdrawalRequests).to.have.lengthOf(1);

				const [currentValidatorNonce, , currentValidatorShareAddress] =
					currentWithdrawalRequests[0];
				expect(currentValidatorNonce).to.equal(1);
				expect(currentValidatorShareAddress).to.equal(
					validatorShareAddress
				);
			});

			it("Should return the right MaticX and POL token balances if submitting POL", async function () {
				const { maticX, pol, stakerA } =
					await loadFixture(deployFixture);

				await pol.connect(stakerA).approve(maticX.address, stakeAmount);
				await maticX.connect(stakerA).submitPOL(stakeAmount);

				const promise = maticX
					.connect(stakerA)
					.requestWithdraw(stakeAmount);
				await expect(promise).to.changeTokenBalance(
					maticX,
					stakerA,
					stakeAmount.mul(-1)
				);
				await expect(promise).to.changeTokenBalance(pol, stakerA, 0);
			});

			it("Should return the right MaticX and POL token balances if submitting Matic", async function () {
				const { maticX, pol, matic, stakerA } =
					await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticX.address, stakeAmount);
				await maticX.connect(stakerA).submit(stakeAmount);

				const promise = maticX
					.connect(stakerA)
					.requestWithdraw(stakeAmount);
				await expect(promise).to.changeTokenBalance(
					maticX,
					stakerA,
					stakeAmount.mul(-1)
				);
				await expect(promise).to.changeTokenBalance(pol, stakerA, 0);
				await expect(promise).to.changeTokenBalance(matic, stakerA, 0);
			});
		});
	});

	describe("Claim a withdrawal", function () {
		describe("Negative", function () {
			it("Should revert with the right error if paused", async function () {
				const { maticX, manager, stakerA } =
					await loadFixture(deployFixture);

				await maticX.connect(manager).togglePause();

				const promise = maticX.connect(stakerA).claimWithdrawal(0);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

			it("Should return the right error if claiming too early", async function () {
				const {
					maticX,
					pol,
					stakeManager,
					stakeManagerGovernance,
					stakerA,
					stakers,
				} = await loadFixture(deployFixture);

				for (const staker of stakers) {
					await pol
						.connect(staker)
						.approve(maticX.address, stakeAmount);
					await maticX.connect(staker).submitPOL(stakeAmount);
				}

				await maticX.connect(stakerA).requestWithdraw(stakeAmount);

				const withdrawalIndex = 0;
				const withdrawalRequests =
					await maticX.getUserWithdrawalRequests(stakerA.address);
				const [, withdrawalEpoch] = withdrawalRequests[withdrawalIndex];

				await stakeManager
					.connect(stakeManagerGovernance)
					.setCurrentEpoch(withdrawalEpoch.sub(1));

				const promise = maticX
					.connect(stakerA)
					.claimWithdrawal(withdrawalIndex);
				await expect(promise).to.be.revertedWith(
					"Not able to claim yet"
				);
			});

			it("Should return the right error if having no requests for the user", async function () {
				const { maticX, stakerA } = await loadFixture(deployFixture);

				const withdrawalIndex = 0;

				const promise = maticX
					.connect(stakerA)
					.claimWithdrawal(withdrawalIndex);
				await expect(promise).to.be.revertedWith("Request not exists");
			});

			it("Should return the right error if having no request at a given index for the user", async function () {
				const { maticX, pol, stakerA, stakers } =
					await loadFixture(deployFixture);

				for (const staker of stakers) {
					await pol
						.connect(staker)
						.approve(maticX.address, stakeAmount);
					await maticX.connect(staker).submitPOL(stakeAmount);
				}

				await maticX.connect(stakerA).requestWithdraw(stakeAmount);

				const withdrawalIndex = 1;

				const promise = maticX
					.connect(stakerA)
					.claimWithdrawal(withdrawalIndex);
				await expect(promise).to.be.revertedWith("Request not exists");
			});
		});

		describe("Positive", function () {
			it("Should emit the ClaimWithdrawal event", async function () {
				const {
					maticX,
					pol,
					stakeManager,
					stakeManagerGovernance,
					stakerA,
					stakers,
				} = await loadFixture(deployFixture);

				for (const staker of stakers) {
					await pol
						.connect(staker)
						.approve(maticX.address, stakeAmount);
					await maticX.connect(staker).submitPOL(stakeAmount);
				}

				await maticX.connect(stakerA).requestWithdraw(stakeAmount);

				const withdrawalIndex = 0;
				const withdrawalRequests =
					await maticX.getUserWithdrawalRequests(stakerA.address);
				const [, withdrawalEpoch] = withdrawalRequests[withdrawalIndex];

				await stakeManager
					.connect(stakeManagerGovernance)
					.setCurrentEpoch(withdrawalEpoch);

				const promise = maticX
					.connect(stakerA)
					.claimWithdrawal(withdrawalIndex);
				await expect(promise)
					.to.emit(maticX, "ClaimWithdrawal")
					.withArgs(stakerA.address, withdrawalIndex, stakeAmount);
			});

			it("Should return the right POL token balances if submitting POL", async function () {
				const {
					maticX,
					pol,
					stakeManager,
					stakeManagerGovernance,
					stakerA,
				} = await loadFixture(deployFixture);

				await pol.connect(stakerA).approve(maticX.address, stakeAmount);
				await maticX.connect(stakerA).submitPOL(stakeAmount);

				await maticX.connect(stakerA).requestWithdraw(stakeAmount);

				const withdrawalIndex = 0;
				const withdrawalRequests =
					await maticX.getUserWithdrawalRequests(stakerA.address);
				const [, withdrawalEpoch] = withdrawalRequests[withdrawalIndex];

				await stakeManager
					.connect(stakeManagerGovernance)
					.setCurrentEpoch(withdrawalEpoch);

				const promise = maticX
					.connect(stakerA)
					.claimWithdrawal(withdrawalIndex);
				await expect(promise).to.changeTokenBalances(
					pol,
					[stakeManager, maticX, stakerA],
					[stakeAmount.mul(-1), 0, stakeAmount]
				);
			});

			it("Should return the right POL token balances if submitting Matic", async function () {
				const {
					maticX,
					pol,
					matic,
					stakeManager,
					stakeManagerGovernance,
					stakerA,
				} = await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticX.address, stakeAmount);
				await maticX.connect(stakerA).submit(stakeAmount);

				await maticX.connect(stakerA).requestWithdraw(stakeAmount);

				const withdrawalIndex = 0;
				const withdrawalRequests =
					await maticX.getUserWithdrawalRequests(stakerA.address);
				const [, withdrawalEpoch] = withdrawalRequests[withdrawalIndex];

				await stakeManager
					.connect(stakeManagerGovernance)
					.setCurrentEpoch(withdrawalEpoch);

				const promise = maticX
					.connect(stakerA)
					.claimWithdrawal(withdrawalIndex);
				await expect(promise).to.changeTokenBalances(
					pol,
					[stakeManager, maticX, stakerA],
					[stakeAmount.mul(-1), 0, stakeAmount]
				);
				await expect(promise).to.changeTokenBalances(
					matic,
					[stakeManager, maticX, stakerA],
					[0, 0, 0]
				);
			});

			it("Should return the right staker's withdrawal requests", async function () {
				const {
					maticX,
					pol,
					stakeManager,
					stakeManagerGovernance,
					stakerA,
					stakers,
				} = await loadFixture(deployFixture);

				for (const staker of stakers) {
					await pol
						.connect(staker)
						.approve(maticX.address, stakeAmount);
					await maticX.connect(staker).submitPOL(stakeAmount);
				}

				await maticX.connect(stakerA).requestWithdraw(stakeAmount);

				const withdrawalIndex = 0;
				const initialWithdrawalRequests =
					await maticX.getUserWithdrawalRequests(stakerA.address);
				const [, withdrawalEpoch] =
					initialWithdrawalRequests[withdrawalIndex];

				await stakeManager
					.connect(stakeManagerGovernance)
					.setCurrentEpoch(withdrawalEpoch);

				await maticX.connect(stakerA).claimWithdrawal(withdrawalIndex);

				const currentWithdrawalRequests =
					await maticX.getUserWithdrawalRequests(stakerA.address);
				expect(currentWithdrawalRequests.length).not.to.equal(
					initialWithdrawalRequests.length
				);
				expect(currentWithdrawalRequests).to.be.empty;
			});
		});
	});

	describe("Withdraw validator rewards", function () {
		describe("Negative", function () {
			it("Should revert with the right error if paused", async function () {
				const { maticX, manager, preferredDepositValidatorId } =
					await loadFixture(deployFixture);

				await maticX.connect(manager).togglePause();

				const promise = maticX
					.connect(manager)
					.withdrawRewards(preferredDepositValidatorId);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

			it("Should revert with the right error if having an insufficient rewards amount", async function () {
				const { maticX, manager, preferredDepositValidatorId } =
					await loadFixture(deployFixture);

				const promise = maticX
					.connect(manager)
					.withdrawRewards(preferredDepositValidatorId);
				await expect(promise).to.be.revertedWith(
					"Too small rewards amount"
				);
			});
		});

		describe("Positive", function () {
			// TODO Add tests
		});
	});

	describe("Withdraw validators rewards", function () {
		describe("Negative", function () {
			it("Should revert with the right error if paused", async function () {
				const {
					maticX,
					manager,
					preferredDepositValidatorId,
					preferredWithdrawalValidatorId,
				} = await loadFixture(deployFixture);

				await maticX.connect(manager).togglePause();

				const promise = maticX
					.connect(manager)
					.withdrawValidatorsReward([
						preferredDepositValidatorId,
						preferredWithdrawalValidatorId,
					]);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

			it("Should revert with the right error if having an insufficient rewards amount", async function () {
				const {
					maticX,
					manager,
					preferredDepositValidatorId,
					preferredWithdrawalValidatorId,
				} = await loadFixture(deployFixture);

				const promise = maticX
					.connect(manager)
					.withdrawValidatorsReward([
						preferredDepositValidatorId,
						preferredWithdrawalValidatorId,
					]);
				await expect(promise).to.be.revertedWith(
					"Too small rewards amount"
				);
			});
		});

		describe("Positive", function () {
			// TODO Add tests
		});
	});

	describe("Set a fee percent", function () {
		describe("Negative", function () {
			it("Should revert with the right error if called by a non admin", async function () {
				const { maticX, stakerA, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = maticX.connect(stakerA).setFeePercent(100);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${stakerA.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing a too high fee percent", async function () {
				const { maticX, manager } = await loadFixture(deployFixture);

				const promise = maticX.connect(manager).setFeePercent(101);
				await expect(promise).to.be.revertedWith(
					"Fee percent must not exceed 100"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the SetFeePercent event", async function () {
				const { maticX, manager } = await loadFixture(deployFixture);

				const feePercent = 100;
				const promise = maticX
					.connect(manager)
					.setFeePercent(feePercent);
				await expect(promise)
					.to.emit(maticX, "SetFeePercent")
					.withArgs(feePercent);
			});
		});
	});

	describe("Set a treasury address", function () {
		const treasuryAddress = generateRandomAddress();

		describe("Negative", function () {
			it("Should revert with the right error if called by a non admin", async function () {
				const { maticX, stakerA, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = maticX
					.connect(stakerA)
					.setTreasury(treasuryAddress);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${stakerA.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing the zero treasury address", async function () {
				const { maticX, manager } = await loadFixture(deployFixture);

				const promise = maticX
					.connect(manager)
					.setTreasury(ethers.constants.AddressZero);
				await expect(promise).to.be.revertedWith(
					"Zero treasury address"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the SetTreasury event", async function () {
				const { maticX, manager } = await loadFixture(deployFixture);

				const promise = maticX
					.connect(manager)
					.setTreasury(treasuryAddress);
				await expect(promise)
					.to.emit(maticX, "SetTreasury")
					.withArgs(treasuryAddress);
			});
		});
	});

	describe("Set a validator registry address", function () {
		const validatorRegistryAddress = generateRandomAddress();

		describe("Negative", function () {
			it("Should revert with the right error if called by a non admin", async function () {
				const { maticX, stakerA, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = maticX
					.connect(stakerA)
					.setValidatorRegistry(validatorRegistryAddress);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${stakerA.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing the zero treasury address", async function () {
				const { maticX, manager } = await loadFixture(deployFixture);

				const promise = maticX
					.connect(manager)
					.setValidatorRegistry(ethers.constants.AddressZero);
				await expect(promise).to.be.revertedWith(
					"Zero validator registry address"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the SetValidatorRegistry event", async function () {
				const { maticX, manager } = await loadFixture(deployFixture);

				const promise = maticX
					.connect(manager)
					.setValidatorRegistry(validatorRegistryAddress);
				await expect(promise)
					.to.emit(maticX, "SetValidatorRegistry")
					.withArgs(validatorRegistryAddress);
			});
		});
	});

	describe("Set a fx state root tunnel address", function () {
		const fxStateRootTunnelAddress = generateRandomAddress();

		describe("Negative", function () {
			it("Should revert with the right error if called by a non admin", async function () {
				const { maticX, stakerA, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = maticX
					.connect(stakerA)
					.setFxStateRootTunnel(fxStateRootTunnelAddress);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${stakerA.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing the zero fx state root tunnel address", async function () {
				const { maticX, manager } = await loadFixture(deployFixture);

				const promise = maticX
					.connect(manager)
					.setFxStateRootTunnel(ethers.constants.AddressZero);
				await expect(promise).to.be.revertedWith(
					"Zero fx state root tunnel address"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the SetFxStateRootTunnel event", async function () {
				const { maticX, manager } = await loadFixture(deployFixture);

				const promise = maticX
					.connect(manager)
					.setFxStateRootTunnel(fxStateRootTunnelAddress);
				await expect(promise)
					.to.emit(maticX, "SetFxStateRootTunnel")
					.withArgs(fxStateRootTunnelAddress);
			});
		});
	});

	describe("Set a version", function () {
		const version = "1";

		describe("Negative", function () {
			it("Should revert with the right error if called by a non admin", async function () {
				const { maticX, stakerA, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = maticX.connect(stakerA).setVersion(version);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${stakerA.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing an empty version", async function () {
				const { maticX, manager } = await loadFixture(deployFixture);

				const promise = maticX.connect(manager).setVersion("");
				await expect(promise).to.be.revertedWith("Empty version");
			});
		});

		describe("Positive", function () {
			it("Should emit the SetVersion event", async function () {
				const { maticX, manager } = await loadFixture(deployFixture);

				const promise = maticX.connect(manager).setVersion(version);
				await expect(promise)
					.to.emit(maticX, "SetVersion")
					.withArgs(version);
			});
		});
	});
});
