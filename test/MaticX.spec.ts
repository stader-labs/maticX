import {
	loadFixture,
	reset,
	setBalance,
} from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
	FxStateRootTunnel,
	IERC20,
	IFxStateRootTunnel,
	IPolygonMigration,
	IStakeManager,
	IValidatorShare,
	MaticX,
} from "../typechain-types";
import { extractEnvironmentVariables } from "../utils/environment";
// import { generateRandomAddress } from "../utils/account";
import { getProviderUrl, Network } from "../utils/network";

const envVars = extractEnvironmentVariables();

const providerUrl = getProviderUrl(
	Network.Ethereum,
	envVars.RPC_PROVIDER,
	envVars.ETHEREUM_API_KEY
);

describe("MaticX", function () {
	const stakeAmount = ethers.parseUnits("100", 18);
	const tripleStakeAmount = stakeAmount * 3n;
	const version = "2";
	const feePercent = 500; // 5%
	// const maxFeePercent = 1_500; // 15%
	// const basisPoints = 10_000;

	async function deployFixture(callMaticXInitializeV2 = true) {
		await reset(providerUrl, envVars.FORKING_BLOCK_NUMBER);

		// EOA definitions
		const manager = await impersonateAccount(
			"0x80A43dd35382C4919991C5Bca7f46Dd24Fde4C67"
		);
		const polygonTreasury = await impersonateAccount(
			"0xcD6507d87F605F5E95C12F7c4B1fC3279dc944aB"
		);
		const stakeManagerGovernance = await impersonateAccount(
			"0x6e7a5820baD6cebA8Ef5ea69c0C92EbbDAc9CE48"
		);
		const validatorShareHolder = await impersonateAccount(
			"0x9789FD6bCDD7077cF52FFDD4f2483513C557cd41"
		);

		const [executor, bot, treasury, stakerA, stakerB] =
			await ethers.getSigners();
		const stakers = [stakerA, stakerB];

		// Contract definitions
		const validatorRegistry = await ethers.getContractAt(
			"ValidatorRegistry",
			"0xf556442D5B77A4B0252630E15d8BbE2160870d77",
			manager
		);
		const validatorRegistryAddress = await validatorRegistry.getAddress();

		const fxStateRootTunnel = (await ethers.getContractAt(
			"IFxStateRootTunnel",
			"0x40FB804Cc07302b89EC16a9f8d040506f64dFe29",
			manager
		)) as IFxStateRootTunnel;
		const fxStateRootTunnelAddress = await fxStateRootTunnel.getAddress();

		const stakeManager = (await ethers.getContractAt(
			"IStakeManager",
			"0x5e3Ef299fDDf15eAa0432E6e66473ace8c13D908"
		)) as IStakeManager;
		const stakeManagerAddress = await stakeManager.getAddress();

		const matic = (await ethers.getContractAt(
			"IERC20",
			"0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0"
		)) as IERC20;
		const maticAddress = await matic.getAddress();

		const pol = (await ethers.getContractAt(
			"IERC20",
			"0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6"
		)) as IERC20;
		const polAddress = await pol.getAddress();

		const polygonMigration = (await ethers.getContractAt(
			"IPolygonMigration",
			"0x29e7DF7b6A1B2b07b731457f499E1696c60E2C4e"
		)) as IPolygonMigration;
		const polygonMigrationAddress = await polygonMigration.getAddress();

		const MaticX = await ethers.getContractFactory("MaticX");
		const maticX = await upgrades.deployProxy(MaticX, [
			validatorRegistryAddress,
			stakeManagerAddress,
			maticAddress,
			manager.address,
			treasury.address,
		]);
		const maticXAddress = await maticX.getAddress();

		// Contract initializations
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

		if (callMaticXInitializeV2) {
			await (maticX.connect(manager) as MaticX as MaticX).initializeV2(
				polAddress
			);
		}

		await (
			maticX.connect(manager) as MaticX as MaticX
		).setFxStateRootTunnel(fxStateRootTunnelAddress);

		const defaultAdminRole = await maticX.DEFAULT_ADMIN_ROLE();
		const botRole = await maticX.BOT();

		await (maticX.connect(manager) as MaticX as MaticX).grantRole(
			botRole,
			bot.address
		);

		// ERC20 transfers
		for (const staker of stakers) {
			await matic
				.connect(polygonTreasury)
				.transfer(staker.address, tripleStakeAmount);
		}

		const polygonTreasuryBalance = await matic.balanceOf(
			polygonTreasury.address
		);
		await matic
			.connect(polygonTreasury)
			.approve(polygonMigrationAddress, polygonTreasuryBalance);
		await polygonMigration
			.connect(polygonTreasury)
			.migrate(polygonTreasuryBalance / 2n);

		for (const staker of stakers) {
			await pol
				.connect(polygonTreasury)
				.transfer(staker.address, tripleStakeAmount);
		}

		return {
			maticX,
			maticXAddress,
			stakeManager,
			stakeManagerAddress,
			validatorRegistry,
			validatorRegistryAddress,
			matic,
			maticAddress,
			pol,
			polAddress,
			polygonMigration,
			polygonMigrationAddress,
			fxStateRootTunnel,
			fxStateRootTunnelAddress,
			manager,
			bot,
			treasury,
			stakeManagerGovernance,
			executor,
			polygonTreasury,
			stakerA,
			stakerB,
			stakers,
			validatorShareHolder,
			defaultAdminRole,
			botRole,
			preferredDepositValidatorId,
			preferredWithdrawalValidatorId,
		};
	}

	async function impersonateAccount(address: string) {
		setBalance(address, ethers.parseEther("10000"));
		return await ethers.getImpersonatedSigner(address);
	}

	describe("Deploy the contract", function () {
		describe("Negative", function () {
			it("Should revert with the right error if passing the zero validator registry address", async function () {
				const { stakeManagerAddress, maticAddress, manager, treasury } =
					await loadFixture(deployFixture);

				const MaticX = await ethers.getContractFactory("MaticX");
				const promise = upgrades.deployProxy(MaticX, [
					ethers.ZeroAddress,
					stakeManagerAddress,
					maticAddress,
					manager.address,
					treasury.address,
				]);
				await expect(promise).to.be.revertedWith(
					"Zero validator registry address"
				);
			});

			it("Should revert with the right error if passing the zero stake manager address", async function () {
				const {
					validatorRegistryAddress,
					maticAddress,
					manager,
					treasury,
				} = await loadFixture(deployFixture);

				const MaticX = await ethers.getContractFactory("MaticX");
				const promise = upgrades.deployProxy(MaticX, [
					validatorRegistryAddress,
					ethers.ZeroAddress,
					maticAddress,
					manager.address,
					treasury.address,
				]);
				await expect(promise).to.be.revertedWith(
					"Zero stake manager address"
				);
			});

			it("Should revert with the right error if passing the zero Matic token address", async function () {
				const {
					validatorRegistryAddress,
					stakeManagerAddress,
					manager,
					treasury,
				} = await loadFixture(deployFixture);

				const MaticX = await ethers.getContractFactory("MaticX");
				const promise = upgrades.deployProxy(MaticX, [
					validatorRegistryAddress,
					stakeManagerAddress,
					ethers.ZeroAddress,
					manager.address,
					treasury.address,
				]);
				await expect(promise).to.be.revertedWith(
					"Zero Matic token address"
				);
			});

			it("Should revert with the right error if passing the zero manager address", async function () {
				const {
					validatorRegistryAddress,
					stakeManagerAddress,
					maticAddress,
					treasury,
				} = await loadFixture(deployFixture);

				const MaticX = await ethers.getContractFactory("MaticX");
				const promise = upgrades.deployProxy(MaticX, [
					validatorRegistryAddress,
					stakeManagerAddress,
					maticAddress,
					ethers.ZeroAddress,
					treasury.address,
				]);
				await expect(promise).to.be.revertedWith(
					"Zero manager address"
				);
			});

			it("Should revert with the right error if passing the zero treasury address", async function () {
				const {
					validatorRegistryAddress,
					stakeManagerAddress,
					maticAddress,
					manager,
				} = await loadFixture(deployFixture);

				const MaticX = await ethers.getContractFactory("MaticX");
				const promise = upgrades.deployProxy(MaticX, [
					validatorRegistryAddress,
					stakeManagerAddress,
					maticAddress,
					manager.address,
					ethers.ZeroAddress,
				]);
				await expect(promise).to.be.revertedWith(
					"Zero treasury address"
				);
			});

			it("Should revert with the right error if reinitializing", async function () {
				const {
					maticX,
					validatorRegistryAddress,
					stakeManagerAddress,
					maticAddress,
					manager,
					treasury,
				} = await loadFixture(deployFixture);

				const promise = maticX.initialize(
					validatorRegistryAddress,
					stakeManagerAddress,
					maticAddress,
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

			it("Should return the default admin role set for the bot", async function () {
				const { maticX, bot, botRole } =
					await loadFixture(deployFixture);

				const hasRole = await maticX.hasRole(botRole, bot.address);
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
				expect(currentVersion).to.equal(version);
			});

			it("Should return the right fee percent", async function () {
				const { maticX } = await loadFixture(deployFixture);

				const currentFeePercent = await maticX.feePercent();
				expect(currentFeePercent).to.equal(feePercent);
			});

			it("Should return the right instant pool owner", async function () {
				const { maticX } = await loadFixture(deployFixture);

				const currentInstantPoolOwner = await maticX.instantPoolOwner();
				expect(currentInstantPoolOwner).to.equal(ethers.ZeroAddress);
			});

			it("Should return the right Matic amount in the instant pool", async function () {
				const { maticX } = await loadFixture(deployFixture);

				const currentInstantPoolMatic = await maticX.instantPoolMatic();
				expect(currentInstantPoolMatic).to.equal(0);
			});

			it("Should return the right MaticX amount in the instant pool", async function () {
				const { maticX } = await loadFixture(deployFixture);

				const currentInstantPoolMaticX =
					await maticX.instantPoolMaticX();
				expect(currentInstantPoolMaticX).to.equal(0);
			});

			it("Should return the fx state root tunnel address", async function () {
				const { maticX, fxStateRootTunnelAddress } =
					await loadFixture(deployFixture);

				const currentFxStateRootTunnel =
					await maticX.fxStateRootTunnel();
				expect(currentFxStateRootTunnel).to.equal(
					fxStateRootTunnelAddress
				);
			});

			it("Should return the right contract addresses", async function () {
				const {
					maticX,
					stakeManagerAddress,
					maticAddress,
					validatorRegistryAddress,
					polAddress,
				} = await loadFixture(deployFixture);

				const [
					currentStakeManagerAddress,
					currentMaticAddress,
					currentValidatorRegistryAddress,
					currentPolAddress,
				] = await maticX.getContracts();
				expect(currentStakeManagerAddress).to.equal(
					stakeManagerAddress
				);
				expect(currentMaticAddress).to.equal(maticAddress);
				expect(currentValidatorRegistryAddress).to.equal(
					validatorRegistryAddress
				);
				expect(currentPolAddress).to.equal(polAddress);
			});
		});
	});

	describe("Upgrade the contract", function () {
		describe("Checks", function () {
			it("Should return a new address of the implementation if extended", async function () {
				const { maticX, maticXAddress } =
					await loadFixture(deployFixture);

				const initialImplementationAddress =
					await upgrades.erc1967.getImplementationAddress(
						maticXAddress
					);

				const ExtendedMaticXMock =
					await ethers.getContractFactory("ExtendedMaticXMock");
				await upgrades.upgradeProxy(maticX, ExtendedMaticXMock);

				const currentImplementationAddress =
					await upgrades.erc1967.getImplementationAddress(
						maticXAddress
					);
				expect(initialImplementationAddress).not.to.equal(
					currentImplementationAddress
				);
			});

			it("Should return the same address of the implementation if not extended", async function () {
				const { maticX, maticXAddress } =
					await loadFixture(deployFixture);

				const initialImplementationAddress =
					await upgrades.erc1967.getImplementationAddress(
						maticXAddress
					);

				const MaticX = await ethers.getContractFactory("MaticX");
				await upgrades.upgradeProxy(maticX, MaticX);

				const currentImplementationAddress =
					await upgrades.erc1967.getImplementationAddress(
						maticXAddress
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
				const { maticXAddress, executor } =
					await loadFixture(deployFixture);

				const iface = new ethers.Interface([
					"function foobar(uint256)",
				]);
				const promise = executor.sendTransaction({
					to: maticXAddress,
					data: iface.encodeFunctionData("foobar", [1]),
				});
				await expect(promise).to.be.reverted;
			});

			it("Should revert if sending arbitrary data", async function () {
				const { maticXAddress, executor } =
					await loadFixture(deployFixture);

				const promise = executor.sendTransaction({
					to: maticXAddress,
					data: "0x01",
				});
				await expect(promise).to.be.reverted;
			});

			it("Should revert if sending no data", async function () {
				const { maticXAddress, executor } =
					await loadFixture(deployFixture);

				const promise = executor.sendTransaction({
					to: maticXAddress,
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

				const promise = (maticX.connect(executor) as MaticX).grantRole(
					defaultAdminRole,
					executor.address
				);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the RoleGranted event", async function () {
				const { maticX, manager, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = (
					maticX.connect(manager) as MaticX as MaticX
				).grantRole(defaultAdminRole, executor.address);
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

				await (maticX.connect(manager) as MaticX as MaticX).grantRole(
					defaultAdminRole,
					executor.address
				);

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

				const promise = (maticX.connect(executor) as MaticX).revokeRole(
					defaultAdminRole,
					executor.address
				);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the RoleRevoked event", async function () {
				const { maticX, manager, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				await (maticX.connect(manager) as MaticX as MaticX).grantRole(
					defaultAdminRole,
					executor.address
				);

				const promise = (
					maticX.connect(manager) as MaticX as MaticX
				).revokeRole(defaultAdminRole, executor.address);
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

				await (maticX.connect(manager) as MaticX as MaticX).grantRole(
					defaultAdminRole,
					executor.address
				);

				await (maticX.connect(manager) as MaticX).revokeRole(
					defaultAdminRole,
					executor.address
				);

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

				const promise = (
					maticX.connect(manager) as MaticX
				).renounceRole(defaultAdminRole, executor.address);
				await expect(promise).to.be.revertedWith(
					"AccessControl: can only renounce roles for self"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the RoleRevoked event", async function () {
				const { maticX, manager, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = (
					maticX.connect(manager) as MaticX
				).renounceRole(defaultAdminRole, manager.address);
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

				await (maticX.connect(manager) as MaticX).renounceRole(
					defaultAdminRole,
					manager.address
				);

				const hasRole = await maticX.hasRole(
					defaultAdminRole,
					manager.address
				);
				expect(hasRole).to.be.false;
			});
		});
	});

	describe("Initialize V2", function () {
		describe("Negative", function () {
			it("Should revert with the right error if reinitializing", async function () {
				const { maticX, polAddress, manager } = await loadFixture(
					deployFixture.bind(null, false)
				);

				await (maticX.connect(manager) as MaticX).initializeV2(
					polAddress
				);

				const promise = (
					maticX.connect(manager) as MaticX
				).initializeV2(polAddress);
				await expect(promise).to.be.revertedWith(
					"Initializable: contract is already initialized"
				);
			});

			it("Should revert with the right error if called by a non admin", async function () {
				const { maticX, polAddress, executor, defaultAdminRole } =
					await loadFixture(deployFixture.bind(null, false));

				const promise = (
					maticX.connect(executor) as MaticX
				).initializeV2(polAddress);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing the zero pol token address", async function () {
				const { maticX, manager } = await loadFixture(
					deployFixture.bind(null, false)
				);

				const promise = (
					maticX.connect(manager) as MaticX
				).initializeV2(ethers.ZeroAddress);
				await expect(promise).to.be.revertedWith(
					"Zero POL token address"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the Initialized and RoleAdminChanged events", async function () {
				const {
					maticX,
					polAddress,
					manager,
					botRole,
					defaultAdminRole,
				} = await loadFixture(deployFixture.bind(null, false));

				const promise = (
					maticX.connect(manager) as MaticX
				).initializeV2(polAddress);
				await expect(promise)
					.to.emit(maticX, "Initialized")
					.withArgs(2)
					.and.to.emit(maticX, "RoleAdminChanged")
					.withArgs(botRole, defaultAdminRole, defaultAdminRole);
			});

			it("Should return the right version", async function () {
				const { maticX, polAddress, manager } = await loadFixture(
					deployFixture.bind(null, false)
				);

				await (maticX.connect(manager) as MaticX).initializeV2(
					polAddress
				);

				const currentVersion = await maticX.version();
				expect(currentVersion).to.equal(version);
			});

			it("Should return the right contract addresses", async function () {
				const {
					maticX,
					stakeManagerAddress,
					maticAddress,
					validatorRegistryAddress,
					polAddress,
					manager,
				} = await loadFixture(deployFixture.bind(null, false));

				await (maticX.connect(manager) as MaticX).initializeV2(
					polAddress
				);

				const [
					currentStakeManagerAddress,
					currentMaticAddress,
					currentValidatorRegistryAddress,
					currentPolAddress,
				] = await maticX.getContracts();
				expect(currentStakeManagerAddress).to.equal(
					stakeManagerAddress
				);
				expect(currentMaticAddress).to.equal(maticAddress);
				expect(currentValidatorRegistryAddress).to.equal(
					validatorRegistryAddress
				);
				expect(currentPolAddress).to.equal(polAddress);
			});

			it("Should return the right instant pool owner", async function () {
				const { maticX } = await loadFixture(deployFixture);

				const currentInstantPoolOwner = await maticX.instantPoolOwner();
				expect(currentInstantPoolOwner).to.equal(ethers.ZeroAddress);
			});

			it("Should return the right Matic amount in the instant pool", async function () {
				const { maticX } = await loadFixture(deployFixture);

				const currentInstantPoolMatic = await maticX.instantPoolMatic();
				expect(currentInstantPoolMatic).to.equal(0);
			});

			it("Should return the right MaticX amount in the instant pool", async function () {
				const { maticX } = await loadFixture(deployFixture);

				const currentInstantPoolMaticX =
					await maticX.instantPoolMaticX();
				expect(currentInstantPoolMaticX).to.equal(0);
			});

			it("Should return the right allowance of the POL token for the StakeManager contract", async function () {
				const {
					maticX,
					maticXAddress,
					stakeManagerAddress,
					pol,
					polAddress,
					manager,
				} = await loadFixture(deployFixture.bind(null, false));

				await (maticX.connect(manager) as MaticX).initializeV2(
					polAddress
				);

				const currentAllowance = await pol.allowance(
					maticXAddress,
					stakeManagerAddress
				);
				expect(currentAllowance).to.equal(ethers.MaxUint256);
			});
		});
	});

	describe("Submit Matic", function () {
		describe("Negative", function () {
			it("Should revert with the right error if paused", async function () {
				const { maticX, manager, stakerA } =
					await loadFixture(deployFixture);

				await (maticX.connect(manager) as MaticX).togglePause();

				const promise = (maticX.connect(stakerA) as MaticX).submit(
					stakeAmount
				);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

			it("Should revert with the right error if passing the zero amount", async function () {
				const { maticX, stakerA } = await loadFixture(deployFixture);

				const promise = (maticX.connect(stakerA) as MaticX).submit(0);
				await expect(promise).to.be.revertedWith("Invalid amount");
			});

			it("Should revert with the right error if having an insufficient token balance", async function () {
				const { maticX, maticXAddress, matic, stakerA, stakerB } =
					await loadFixture(deployFixture);

				const stakerABalance = await matic.balanceOf(stakerA.address);
				await matic
					.connect(stakerA)
					.approve(maticXAddress, stakeAmount);
				await matic
					.connect(stakerA)
					.transfer(
						stakerB.address,
						stakerABalance - stakeAmount + 1n
					);

				const promise = (maticX.connect(stakerA) as MaticX).submit(
					stakeAmount
				);
				await expect(promise).to.be.revertedWith(
					"SafeERC20: low-level call failed"
				);
			});

			it("Should revert with the right error if having an insufficient token approval", async function () {
				const { maticX, maticXAddress, matic, stakerA } =
					await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticXAddress, stakeAmount - 1n);

				const promise = (maticX.connect(stakerA) as MaticX).submit(
					stakeAmount
				);
				await expect(promise).to.be.revertedWith(
					"SafeERC20: low-level call failed"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the Submit and Delegate events", async function () {
				const {
					maticX,
					maticXAddress,
					matic,
					stakerA,
					preferredDepositValidatorId,
				} = await loadFixture(deployFixture);

				await (matic.connect(stakerA) as MaticX).approve(
					maticXAddress,
					stakeAmount
				);

				const promise = (maticX.connect(stakerA) as MaticX).submit(
					stakeAmount
				);
				await expect(promise)
					.to.emit(maticX, "Submit")
					.withArgs(stakerA.address, stakeAmount)
					.and.to.emit(maticX, "Delegate")
					.withArgs(preferredDepositValidatorId, stakeAmount);
			});

			it("Should emit the Transfer event", async function () {
				const { maticX, maticXAddress, matic, stakerA } =
					await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticXAddress, stakeAmount);

				const promise = (maticX.connect(stakerA) as MaticX).submit(
					stakeAmount
				);
				await expect(promise)
					.to.emit(maticX, "Transfer")
					.withArgs(ethers.ZeroAddress, stakerA.address, stakeAmount);
			});

			it("Should emit the ShareMinted event on the StakingInfo contract", async function () {
				const {
					maticX,
					maticXAddress,
					stakeManager,
					matic,
					stakerA,
					preferredDepositValidatorId,
				} = await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticXAddress, stakeAmount);

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

				const promise = (maticX.connect(stakerA) as MaticX).submit(
					stakeAmount
				);
				await expect(promise)
					.to.emit(stakingLogger, "ShareMinted")
					.withArgs(
						preferredDepositValidatorId,
						maticXAddress,
						stakeAmount,
						stakeAmount
					);
			});

			it("Should return the right MaticX balance", async function () {
				const { maticX, maticXAddress, matic, stakerA } =
					await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticXAddress, stakeAmount);

				const promise = (maticX.connect(stakerA) as MaticX).submit(
					stakeAmount
				);
				await expect(promise).to.changeTokenBalance(
					maticX,
					stakerA,
					stakeAmount
				);
			});

			it("Should return the right Matic and POL token balances", async function () {
				const {
					maticX,
					maticXAddress,
					stakeManager,
					matic,
					pol,
					stakerA,
				} = await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticXAddress, stakeAmount);

				const promise = (maticX.connect(stakerA) as MaticX).submit(
					stakeAmount
				);
				await expect(promise).to.changeTokenBalances(
					matic,
					[stakerA, maticX],
					[-stakeAmount, 0]
				);
				await expect(promise).to.changeTokenBalances(
					pol,
					[stakeManager],
					[stakeAmount]
				);
			});

			it("Should return the right MaticX to POL conversion", async function () {
				const { maticX, maticXAddress, matic, stakerA } =
					await loadFixture(deployFixture);

				await (matic.connect(stakerA) as MaticX).approve(
					maticXAddress,
					stakeAmount
				);

				const initialConversion =
					await maticX.convertMaticXToPOL(stakeAmount);

				await (maticX.connect(stakerA) as MaticX).submit(stakeAmount);

				const currentConversion =
					await maticX.convertMaticXToPOL(stakeAmount);
				expect(initialConversion).not.to.equal(currentConversion);
				expect(currentConversion[0]).to.equal(stakeAmount);
				expect(currentConversion[1]).to.equal(stakeAmount);
				expect(currentConversion[2]).to.equal(stakeAmount);
			});

			it("Should return the right MaticX to POL conversion in a backward compatible manner", async function () {
				const { maticX, maticXAddress, matic, stakerA } =
					await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticXAddress, stakeAmount);

				const initialConversion =
					await maticX.convertMaticXToMatic(stakeAmount);

				await (maticX.connect(stakerA) as MaticX).submit(stakeAmount);

				const currentConversion =
					await maticX.convertMaticXToMatic(stakeAmount);
				expect(initialConversion).not.to.equal(currentConversion);
				expect(currentConversion[0]).to.equal(stakeAmount);
				expect(currentConversion[1]).to.equal(stakeAmount);
				expect(currentConversion[2]).to.equal(stakeAmount);
			});

			it("Should return the right POL to MaticX conversion", async function () {
				const { maticX, maticXAddress, matic, stakerA } =
					await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticXAddress, stakeAmount);

				const initialConversion =
					await maticX.convertPOLToMaticX(stakeAmount);

				await (maticX.connect(stakerA) as MaticX).submit(stakeAmount);

				const currentConversion =
					await maticX.convertPOLToMaticX(stakeAmount);
				expect(initialConversion).not.to.equal(currentConversion);
				expect(currentConversion[0]).to.equal(stakeAmount);
				expect(currentConversion[1]).to.equal(stakeAmount);
				expect(currentConversion[2]).to.equal(stakeAmount);
			});

			it("Should return the right POL to MaticX conversion in a backward compatible manner", async function () {
				const { maticX, maticXAddress, matic, stakerA } =
					await loadFixture(deployFixture);

				await matic
					.connect(stakerA)
					.approve(maticXAddress, stakeAmount);

				const initialConversion =
					await maticX.convertMaticToMaticX(stakeAmount);

				await (maticX.connect(stakerA) as MaticX).submit(stakeAmount);

				const currentConversion =
					await maticX.convertMaticToMaticX(stakeAmount);
				expect(initialConversion).not.to.equal(currentConversion);
				expect(currentConversion[0]).to.equal(stakeAmount);
				expect(currentConversion[1]).to.equal(stakeAmount);
				expect(currentConversion[2]).to.equal(stakeAmount);
			});

			it("Should return the right validators' total stake", async function () {
				const { maticX, maticXAddress, matic, stakers } =
					await loadFixture(deployFixture);

				for (const staker of stakers) {
					await matic
						.connect(staker)
						.approve(maticXAddress, tripleStakeAmount);

					for (let i = 0; i < 3; i++) {
						await (maticX.connect(staker) as MaticX).submit(
							stakeAmount
						);
					}
				}

				const currentValidatorsTotalStake =
					await maticX.getTotalStakeAcrossAllValidators();
				expect(currentValidatorsTotalStake).to.equal(
					tripleStakeAmount * 2n
				);
			});

			it("Should return the right validators' total stake in a backward compatible manner", async function () {
				const { maticX, maticXAddress, matic, stakers } =
					await loadFixture(deployFixture);

				for (const staker of stakers) {
					await (matic.connect(staker) as MaticX).approve(
						maticXAddress,
						tripleStakeAmount
					);

					for (let i = 0; i < 3; i++) {
						await (maticX.connect(staker) as MaticX).submit(
							stakeAmount
						);
					}
				}

				const currentValidatorsTotalStake =
					await maticX.getTotalPooledMatic();
				expect(currentValidatorsTotalStake).to.equal(
					tripleStakeAmount * 2n
				);
			});

			it("Should return the right total stake from a validator share", async function () {
				const {
					maticX,
					maticXAddress,
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
						.approve(maticXAddress, stakeAmount);
					await (maticX.connect(staker) as MaticX).submit(
						stakeAmount
					);
				}

				const currentTotalStake = await maticX.getTotalStake(
					validatorShareAddress
				);
				expect(currentTotalStake).not.to.equal(initialTotalStake);
				expect(currentTotalStake[0]).to.equal(stakeAmount * 2n);
				expect(currentTotalStake[1]).to.equal(
					ethers.parseUnits("100000000000", 18)
				);
			});
		});
	});

	describe("Submit POL", function () {
		describe("Negative", function () {
			it("Should revert with the right error if paused", async function () {
				const { maticX, manager, stakerA } =
					await loadFixture(deployFixture);

				await (maticX.connect(manager) as MaticX).togglePause();

				const promise = (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

			it("Should revert with the right error if passing the zero amount", async function () {
				const { maticX, stakerA } = await loadFixture(deployFixture);

				const promise = (maticX.connect(stakerA) as MaticX).submitPOL(
					0
				);
				await expect(promise).to.be.revertedWith("Invalid amount");
			});

			it("Should revert with the right error if having an insufficient token balance", async function () {
				const { maticX, maticXAddress, pol, stakerA, stakerB } =
					await loadFixture(deployFixture);

				const stakerABalance = await pol.balanceOf(stakerA.address);
				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);
				await pol
					.connect(stakerA)
					.transfer(
						stakerB.address,
						stakerABalance - stakeAmount + 1n
					);

				const promise = (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);
				await expect(promise).to.be.revertedWith(
					"ERC20: transfer amount exceeds balance"
				);
			});

			it("Should revert with the right error if having an insufficient token approval", async function () {
				const { maticX, maticXAddress, pol, stakerA } =
					await loadFixture(deployFixture);

				await pol
					.connect(stakerA)
					.approve(maticXAddress, stakeAmount - 1n);

				const promise = (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);
				await expect(promise).to.be.revertedWith(
					"ERC20: insufficient allowance"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the Submit and Delegate events on the MaticX contract", async function () {
				const {
					maticX,
					maticXAddress,
					pol,
					stakerA,
					preferredDepositValidatorId,
				} = await loadFixture(deployFixture);

				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);

				const promise = (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);
				await expect(promise)
					.to.emit(maticX, "Submit")
					.withArgs(stakerA.address, stakeAmount)
					.and.to.emit(maticX, "Delegate")
					.withArgs(preferredDepositValidatorId, stakeAmount);
			});

			it("Should emit the Transfer event on the MaticX contract", async function () {
				const { maticX, maticXAddress, pol, stakerA } =
					await loadFixture(deployFixture);

				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);

				const promise = (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);
				await expect(promise)
					.to.emit(maticX, "Transfer")
					.withArgs(ethers.ZeroAddress, stakerA.address, stakeAmount);
			});

			it("Should emit the ShareMinted event on the StakingInfo contract", async function () {
				const {
					maticX,
					maticXAddress,
					stakeManager,
					pol,
					stakerA,
					preferredDepositValidatorId,
				} = await loadFixture(deployFixture);

				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);

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

				const promise = (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);
				await expect(promise)
					.to.emit(stakingLogger, "ShareMinted")
					.withArgs(
						preferredDepositValidatorId,
						maticXAddress,
						stakeAmount,
						stakeAmount
					);
			});

			it("Should return the right MaticX balance", async function () {
				const { maticX, maticXAddress, pol, stakerA } =
					await loadFixture(deployFixture);

				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);

				const promise = (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);
				await expect(promise).to.changeTokenBalance(
					maticX,
					stakerA,
					stakeAmount
				);
			});

			it("Should return the right POL token balances", async function () {
				const { maticX, maticXAddress, stakeManager, pol, stakerA } =
					await loadFixture(deployFixture);

				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);

				const promise = (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);
				await expect(promise).to.changeTokenBalances(
					pol,
					[stakerA, maticX, stakeManager],
					[-stakeAmount, 0, stakeAmount]
				);
			});

			it("Should return the right MaticX to POL conversion", async function () {
				const { maticX, maticXAddress, pol, stakerA } =
					await loadFixture(deployFixture);

				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);

				const initialConversion =
					await maticX.convertMaticXToPOL(stakeAmount);

				await (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);

				const currentConversion =
					await maticX.convertMaticXToPOL(stakeAmount);
				expect(initialConversion).not.to.equal(currentConversion);
				expect(currentConversion[0]).to.equal(stakeAmount);
				expect(currentConversion[1]).to.equal(stakeAmount);
				expect(currentConversion[2]).to.equal(stakeAmount);
			});

			it("Should return the right MaticX to POL conversion in a backward compatible manner", async function () {
				const { maticX, maticXAddress, pol, stakerA } =
					await loadFixture(deployFixture);

				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);

				const initialConversion =
					await maticX.convertMaticXToMatic(stakeAmount);

				await (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);

				const currentConversion =
					await maticX.convertMaticXToMatic(stakeAmount);
				expect(initialConversion).not.to.equal(currentConversion);
				expect(currentConversion[0]).to.equal(stakeAmount);
				expect(currentConversion[1]).to.equal(stakeAmount);
				expect(currentConversion[2]).to.equal(stakeAmount);
			});

			it("Should return the right POL to MaticX conversion", async function () {
				const { maticX, maticXAddress, pol, stakerA } =
					await loadFixture(deployFixture);

				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);

				const initialConversion =
					await maticX.convertPOLToMaticX(stakeAmount);

				await (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);

				const currentConversion =
					await maticX.convertPOLToMaticX(stakeAmount);
				expect(initialConversion).not.to.equal(currentConversion);
				expect(currentConversion[0]).to.equal(stakeAmount);
				expect(currentConversion[1]).to.equal(stakeAmount);
				expect(currentConversion[2]).to.equal(stakeAmount);
			});

			it("Should return the right POL to MaticX conversion in a backward compatible manner", async function () {
				const { maticX, maticXAddress, pol, stakerA } =
					await loadFixture(deployFixture);

				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);

				const initialConversion =
					await maticX.convertMaticToMaticX(stakeAmount);

				await (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);

				const currentConversion =
					await maticX.convertMaticToMaticX(stakeAmount);
				expect(initialConversion).not.to.equal(currentConversion);
				expect(currentConversion[0]).to.equal(stakeAmount);
				expect(currentConversion[1]).to.equal(stakeAmount);
				expect(currentConversion[2]).to.equal(stakeAmount);
			});

			it("Should return the right validators' total stake", async function () {
				const { maticX, maticXAddress, pol, stakers } =
					await loadFixture(deployFixture);

				for (const staker of stakers) {
					await pol
						.connect(staker)
						.approve(maticXAddress, tripleStakeAmount);

					for (let i = 0; i < 3; i++) {
						await (maticX.connect(staker) as MaticX).submitPOL(
							stakeAmount
						);
					}
				}

				const currentValidatorsTotalStake =
					await maticX.getTotalStakeAcrossAllValidators();
				expect(currentValidatorsTotalStake).to.equal(
					tripleStakeAmount * 2n
				);
			});

			it("Should return the right validators' total stake in a backward compatible manner", async function () {
				const { maticX, maticXAddress, pol, stakers } =
					await loadFixture(deployFixture);

				for (const staker of stakers) {
					await pol
						.connect(staker)
						.approve(maticXAddress, tripleStakeAmount);

					for (let i = 0; i < 3; i++) {
						await (maticX.connect(staker) as MaticX).submitPOL(
							stakeAmount
						);
					}
				}

				const currentValidatorsTotalStake =
					await maticX.getTotalPooledMatic();
				expect(currentValidatorsTotalStake).to.equal(
					tripleStakeAmount * 2n
				);
			});

			it("Should return the right total stake from a validator share", async function () {
				const {
					maticX,
					maticXAddress,
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
						.approve(maticXAddress, stakeAmount);
					await (maticX.connect(staker) as MaticX).submitPOL(
						stakeAmount
					);
				}

				const currentTotalStake = await maticX.getTotalStake(
					validatorShareAddress
				);
				expect(currentTotalStake).not.to.equal(initialTotalStake);
				expect(currentTotalStake[0]).to.equal(stakeAmount * 2n);
				expect(currentTotalStake[1]).to.equal(
					ethers.parseUnits("100000000000", 18)
				);
			});
		});
	});

	describe("Request a withdrawal", function () {
		describe("Negative", function () {
			it("Should revert with the right error if paused", async function () {
				const { maticX, manager, stakerA } =
					await loadFixture(deployFixture);

				await (maticX.connect(manager) as MaticX).togglePause();

				const promise = (
					maticX.connect(stakerA) as MaticX
				).requestWithdraw(stakeAmount);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

			it("Should revert with the right error if passing the zero amount", async function () {
				const { maticX, maticXAddress, pol, stakerA } =
					await loadFixture(deployFixture);

				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);
				await (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);

				const promise = (
					maticX.connect(stakerA) as MaticX
				).requestWithdraw(0);
				await expect(promise).to.be.revertedWith("Invalid amount");
			});

			it("Should revert with the right error if passing a higher amount than staked before", async function () {
				const { maticX, maticXAddress, pol, stakerA } =
					await loadFixture(deployFixture);

				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);
				await (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);

				const promise = (
					maticX.connect(stakerA) as MaticX
				).requestWithdraw(stakeAmount + 1n);
				await expect(promise).to.be.revertedWith(
					"ERC20: burn amount exceeds balance"
				);
			});

			it("Should revert with the right error if passing an insufficient amount after a previous transfer", async function () {
				const { maticX, maticXAddress, pol, stakerA, stakerB } =
					await loadFixture(deployFixture);

				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);
				await (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);

				await (maticX.connect(stakerA) as MaticX).transfer(
					stakerB.address,
					1
				);

				const promise = (
					maticX.connect(stakerA) as MaticX
				).requestWithdraw(stakeAmount);
				await expect(promise).to.be.revertedWith(
					"ERC20: burn amount exceeds balance"
				);
			});

			it("Should revert with the right error if having no withdrawal request for the user", async function () {
				const { maticX, maticXAddress, pol, stakerA } =
					await loadFixture(deployFixture);

				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);
				await (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);

				const promise = maticX.getSharesAmountOfUserWithdrawalRequest(
					stakerA.address,
					0
				);
				await expect(promise).to.be.revertedWith(
					"Withdrawal request does not exist"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the RequestWithdraw and Transfer events", async function () {
				const { maticX, maticXAddress, pol, stakerA, stakers } =
					await loadFixture(deployFixture);

				for (const staker of stakers) {
					await (pol.connect(staker) as IERC20).approve(
						maticXAddress,
						stakeAmount
					);
					await (maticX.connect(staker) as MaticX).submitPOL(
						stakeAmount
					);
				}

				const promise = (
					maticX.connect(stakerA) as MaticX
				).requestWithdraw(stakeAmount);
				await expect(promise)
					.to.emit(maticX, "RequestWithdraw")
					.withArgs(stakerA.address, stakeAmount, stakeAmount)
					.and.to.emit(maticX, "Transfer")
					.withArgs(stakerA.address, ethers.ZeroAddress, stakeAmount);
			});

			it("Should return the right MaticX and POL token balances if having POL tokens submitted", async function () {
				const { maticX, maticXAddress, pol, stakerA } =
					await loadFixture(deployFixture);

				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);
				await (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);

				const promise = (
					maticX.connect(stakerA) as MaticX
				).requestWithdraw(stakeAmount);
				await expect(promise).to.changeTokenBalance(
					maticX,
					stakerA,
					-stakeAmount
				);
				await expect(promise).to.changeTokenBalance(pol, stakerA, 0);
			});

			it("Should return the right MaticX balances if having Matic tokens submitted", async function () {
				const { maticX, maticXAddress, matic, stakerA } =
					await loadFixture(deployFixture);

				await (matic.connect(stakerA) as MaticX).approve(
					maticXAddress,
					stakeAmount
				);
				await (maticX.connect(stakerA) as MaticX).submit(stakeAmount);

				const promise = (
					maticX.connect(stakerA) as MaticX
				).requestWithdraw(stakeAmount);
				await expect(promise).to.changeTokenBalance(
					maticX,
					stakerA,
					-stakeAmount
				);
			});

			it("Should return the right staker's withdrawal requests", async function () {
				const {
					maticX,
					maticXAddress,
					pol,
					stakeManager,
					stakerA,
					preferredDepositValidatorId,
				} = await loadFixture(deployFixture);

				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);
				await (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);

				const validatorShareAddress =
					await stakeManager.getValidatorContract(
						preferredDepositValidatorId
					);

				const initialWithdrawalRequests =
					await maticX.getUserWithdrawalRequests(stakerA.address);

				await (maticX.connect(stakerA) as MaticX).requestWithdraw(
					stakeAmount
				);

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

			it("Should return the right amount of staker's shares", async function () {
				const { maticX, maticXAddress, pol, stakerA } =
					await loadFixture(deployFixture);

				await (pol.connect(stakerA) as IERC20).approve(
					maticXAddress,
					stakeAmount
				);
				await (maticX.connect(stakerA) as MaticX).submitPOL(
					stakeAmount
				);

				await (maticX.connect(stakerA) as MaticX).requestWithdraw(
					stakeAmount
				);

				const currentWithdrawalRequestShares =
					await maticX.getSharesAmountOfUserWithdrawalRequest(
						stakerA.address,
						0
					);
				expect(currentWithdrawalRequestShares).to.equal(stakeAmount);
			});
		});
	});

	// describe("Claim a withdrawal", function () {
	// 	describe("Negative", function () {
	// 		it("Should revert with the right error if paused", async function () {
	// 			const { maticX, manager, stakerA } =
	// 				await loadFixture(deployFixture);

	// 			await (maticX.connect(manager) as MaticX).togglePause();

	// 			const promise = (
	// 				maticX.connect(stakerA) as MaticX
	// 			).claimWithdrawal(0);
	// 			await expect(promise).to.be.revertedWith("Pausable: paused");
	// 		});

	// 		it("Should return the right error if claiming too early", async function () {
	// 			const {
	// 				maticX,
	// 				pol,
	// 				stakeManager,
	// 				stakeManagerGovernance,
	// 				stakerA,
	// 				stakers,
	// 			} = await loadFixture(deployFixture);

	// 			for (const staker of stakers) {
	// 				await pol
	// 					.connect(staker)
	// 					.approve(maticXAddress, stakeAmount);
	// 				await (maticX.connect(staker) as MaticX).submitPOL(
	// 					stakeAmount
	// 				);
	// 			}

	// 			await (maticX.connect(stakerA) as MaticX).requestWithdraw(
	// 				stakeAmount
	// 			);

	// 			const withdrawalIndex = 0;
	// 			const withdrawalRequests =
	// 				await maticX.getUserWithdrawalRequests(stakerA.address);
	// 			const [, requestEpoch] = withdrawalRequests[withdrawalIndex];

	// 			const withdrawalDelay = await stakeManager.withdrawalDelay();
	// 			await stakeManager
	// 				.connect(stakeManagerGovernance)
	// 				.setCurrentEpoch(requestEpoch.add(withdrawalDelay).sub(1));

	// 			const promise = maticX
	// 				.connect(stakerA)
	// 				.claimWithdrawal(withdrawalIndex);
	// 			await expect(promise).to.be.revertedWith(
	// 				"Not able to claim yet"
	// 			);
	// 		});

	// 		it("Should return the right error if having no requests for the user", async function () {
	// 			const { maticX, stakerA } = await loadFixture(deployFixture);

	// 			const withdrawalIndex = 0;

	// 			const promise = maticX
	// 				.connect(stakerA)
	// 				.claimWithdrawal(withdrawalIndex);
	// 			await expect(promise).to.be.revertedWith(
	// 				"Withdrawal request does not exist"
	// 			);
	// 		});

	// 		it("Should return the right error if having no request at a given index for the user", async function () {
	// 			const { maticX, pol, stakerA, stakers } =
	// 				await loadFixture(deployFixture);

	// 			for (const staker of stakers) {
	// 				await pol
	// 					.connect(staker)
	// 					.approve(maticXAddress, stakeAmount);
	// 				await (maticX.connect(staker) as MaticX).submitPOL(
	// 					stakeAmount
	// 				);
	// 			}

	// 			await (maticX.connect(stakerA) as MaticX).requestWithdraw(
	// 				stakeAmount
	// 			);

	// 			const withdrawalIndex = 1;

	// 			const promise = maticX
	// 				.connect(stakerA)
	// 				.claimWithdrawal(withdrawalIndex);
	// 			await expect(promise).to.be.revertedWith(
	// 				"Withdrawal request does not exist"
	// 			);
	// 		});
	// 	});

	// 	describe("Positive", function () {
	// 		it("Should emit the ClaimWithdrawal event", async function () {
	// 			const {
	// 				maticX,
	// 				pol,
	// 				stakeManager,
	// 				stakeManagerGovernance,
	// 				stakerA,
	// 				stakers,
	// 			} = await loadFixture(deployFixture);

	// 			for (const staker of stakers) {
	// 				await pol
	// 					.connect(staker)
	// 					.approve(maticXAddress, stakeAmount);
	// 				await (maticX.connect(staker) as MaticX).submitPOL(
	// 					stakeAmount
	// 				);
	// 			}

	// 			await (maticX.connect(stakerA) as MaticX).requestWithdraw(
	// 				stakeAmount
	// 			);

	// 			const withdrawalIndex = 0;
	// 			const withdrawalRequests =
	// 				await maticX.getUserWithdrawalRequests(stakerA.address);
	// 			const [, requestEpoch] = withdrawalRequests[withdrawalIndex];

	// 			const withdrawalDelay = await stakeManager.withdrawalDelay();
	// 			await stakeManager
	// 				.connect(stakeManagerGovernance)
	// 				.setCurrentEpoch(requestEpoch.add(withdrawalDelay));

	// 			const promise = maticX
	// 				.connect(stakerA)
	// 				.claimWithdrawal(withdrawalIndex);
	// 			await expect(promise)
	// 				.to.emit(maticX, "ClaimWithdrawal")
	// 				.withArgs(stakerA.address, withdrawalIndex, stakeAmount);
	// 		});

	// 		it("Should return the right POL token balances if submitting POL", async function () {
	// 			const {
	// 				maticX,
	// 				pol,
	// 				stakeManager,
	// 				stakeManagerGovernance,
	// 				stakerA,
	// 			} = await loadFixture(deployFixture);

	// 			await (pol.connect(stakerA) as IERC20).approve(
	// 				maticXAddress,
	// 				stakeAmount
	// 			);
	// 			await (maticX.connect(stakerA) as MaticX).submitPOL(
	// 				stakeAmount
	// 			);

	// 			await (maticX.connect(stakerA) as MaticX).requestWithdraw(
	// 				stakeAmount
	// 			);

	// 			const withdrawalIndex = 0;
	// 			const withdrawalRequests =
	// 				await maticX.getUserWithdrawalRequests(stakerA.address);
	// 			const [, requestEpoch] = withdrawalRequests[withdrawalIndex];

	// 			const withdrawalDelay = await stakeManager.withdrawalDelay();
	// 			await stakeManager
	// 				.connect(stakeManagerGovernance)
	// 				.setCurrentEpoch(requestEpoch.add(withdrawalDelay));

	// 			const promise = maticX
	// 				.connect(stakerA)
	// 				.claimWithdrawal(withdrawalIndex);
	// 			await expect(promise).to.changeTokenBalances(
	// 				pol,
	// 				[stakeManager, maticX, stakerA],
	// 				[stakeAmount.mul(-1), 0, stakeAmount]
	// 			);
	// 		});

	// 		it("Should return the right POL token balances if submitting Matic", async function () {
	// 			const {
	// 				maticX,
	// 				pol,
	// 				matic,
	// 				stakeManager,
	// 				stakeManagerGovernance,
	// 				stakerA,
	// 			} = await loadFixture(deployFixture);

	// 			await matic
	// 				.connect(stakerA)
	// 				.approve(maticXAddress, stakeAmount);
	// 			await (maticX.connect(stakerA) as MaticX).submit(stakeAmount);

	// 			await (maticX.connect(stakerA) as MaticX).requestWithdraw(
	// 				stakeAmount
	// 			);

	// 			const withdrawalIndex = 0;
	// 			const withdrawalRequests =
	// 				await maticX.getUserWithdrawalRequests(stakerA.address);
	// 			const [, requestEpoch] = withdrawalRequests[withdrawalIndex];

	// 			const withdrawalDelay = await stakeManager.withdrawalDelay();
	// 			await stakeManager
	// 				.connect(stakeManagerGovernance)
	// 				.setCurrentEpoch(requestEpoch.add(withdrawalDelay));

	// 			const promise = maticX
	// 				.connect(stakerA)
	// 				.claimWithdrawal(withdrawalIndex);
	// 			await expect(promise).to.changeTokenBalances(
	// 				pol,
	// 				[stakeManager, maticX, stakerA],
	// 				[stakeAmount.mul(-1), 0, stakeAmount]
	// 			);
	// 			await expect(promise).to.changeTokenBalances(
	// 				matic,
	// 				[stakeManager, maticX, stakerA],
	// 				[0, 0, 0]
	// 			);
	// 		});

	// 		it("Should return the right staker's withdrawal requests", async function () {
	// 			const {
	// 				maticX,
	// 				pol,
	// 				stakeManager,
	// 				stakeManagerGovernance,
	// 				stakerA,
	// 				stakers,
	// 			} = await loadFixture(deployFixture);

	// 			for (const staker of stakers) {
	// 				await pol
	// 					.connect(staker)
	// 					.approve(maticXAddress, stakeAmount);
	// 				await (maticX.connect(staker) as MaticX).submitPOL(
	// 					stakeAmount
	// 				);
	// 			}

	// 			await (maticX.connect(stakerA) as MaticX).requestWithdraw(
	// 				stakeAmount
	// 			);

	// 			const withdrawalIndex = 0;
	// 			const initialWithdrawalRequests =
	// 				await maticX.getUserWithdrawalRequests(stakerA.address);
	// 			const [, requestEpoch] =
	// 				initialWithdrawalRequests[withdrawalIndex];

	// 			const withdrawalDelay = await stakeManager.withdrawalDelay();
	// 			await stakeManager
	// 				.connect(stakeManagerGovernance)
	// 				.setCurrentEpoch(requestEpoch.add(withdrawalDelay));

	// 			await (maticX.connect(stakerA) as MaticX).claimWithdrawal(
	// 				withdrawalIndex
	// 			);

	// 			const currentWithdrawalRequests =
	// 				await maticX.getUserWithdrawalRequests(stakerA.address);
	// 			expect(currentWithdrawalRequests.length).not.to.equal(
	// 				initialWithdrawalRequests.length
	// 			);
	// 			expect(currentWithdrawalRequests).to.be.empty;
	// 		});
	// 	});
	// });

	// describe("Withdraw validator rewards", function () {
	// 	describe("Negative", function () {
	// 		it("Should revert with the right error if paused", async function () {
	// 			const { maticX, manager, preferredDepositValidatorId } =
	// 				await loadFixture(deployFixture);

	// 			await (maticX.connect(manager) as MaticX).togglePause();

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.withdrawRewards(preferredDepositValidatorId);
	// 			await expect(promise).to.be.revertedWith("Pausable: paused");
	// 		});

	// 		it("Should revert with the right error if having an insufficient rewards amount", async function () {
	// 			const { maticX, manager, preferredDepositValidatorId } =
	// 				await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.withdrawRewards(preferredDepositValidatorId);
	// 			await expect(promise).to.be.revertedWith(
	// 				"Too small rewards amount"
	// 			);
	// 		});

	// 		it("Should revert without a reason if passing an non existing validator id", async function () {
	// 			const { maticX, manager } = await loadFixture(deployFixture);

	// 			const promise = (
	// 				maticX.connect(manager) as MaticX
	// 			).withdrawRewards(1_000);
	// 			await expect(promise).to.be.revertedWithoutReason();
	// 		});
	// 	});

	// 	describe("Positive", function () {
	// 		it.skip("Should emit the WithdrawRewards event", async function () {
	// 			const {
	// 				maticX,
	// 				stakeManager,
	// 				manager,
	// 				validatorShareHolder,
	// 				preferredDepositValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			const validatorShareAddress =
	// 				await stakeManager.getValidatorContract(
	// 					preferredDepositValidatorId
	// 				);

	// 			const validatorShare = (await ethers.getContractAt(
	// 				"IValidatorShare",
	// 				validatorShareAddress
	// 			)) as IValidatorShare;

	// 			const validatorShareHolderBalance =
	// 				await validatorShare.balanceOf(
	// 					validatorShareHolder.address
	// 				);
	// 			await validatorShare
	// 				.connect(validatorShareHolder)
	// 				.transfer(maticXAddress, validatorShareHolderBalance);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.withdrawRewards(preferredDepositValidatorId);
	// 			await expect(promise)
	// 				.to.emit(maticX, "WithdrawRewards")
	// 				.withArgs(
	// 					preferredDepositValidatorId,
	// 					validatorShareHolderBalance
	// 				);
	// 		});
	// 	});
	// });

	// describe("Withdraw validators rewards", function () {
	// 	describe("Negative", function () {
	// 		it("Should revert with the right error if paused", async function () {
	// 			const {
	// 				maticX,
	// 				manager,
	// 				preferredDepositValidatorId,
	// 				preferredWithdrawalValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			await (maticX.connect(manager) as MaticX).togglePause();

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.withdrawValidatorsReward([
	// 					preferredDepositValidatorId,
	// 					preferredWithdrawalValidatorId,
	// 				]);
	// 			await expect(promise).to.be.revertedWith("Pausable: paused");
	// 		});

	// 		it("Should revert with the right error if having an insufficient rewards amount", async function () {
	// 			const {
	// 				maticX,
	// 				manager,
	// 				preferredDepositValidatorId,
	// 				preferredWithdrawalValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.withdrawValidatorsReward([
	// 					preferredDepositValidatorId,
	// 					preferredWithdrawalValidatorId,
	// 				]);
	// 			await expect(promise).to.be.revertedWith(
	// 				"Too small rewards amount"
	// 			);
	// 		});

	// 		it("Should revert without a reason if passing an non existing validator id", async function () {
	// 			const { maticX, manager, preferredDepositValidatorId } =
	// 				await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.withdrawValidatorsReward([
	// 					1_000,
	// 					preferredDepositValidatorId,
	// 				]);
	// 			await expect(promise).to.be.revertedWithoutReason();
	// 		});
	// 	});

	// 	describe("Positive", function () {
	// 		it.skip("Should emit the WithdrawRewards event", async function () {
	// 			const {
	// 				maticX,
	// 				stakeManager,
	// 				manager,
	// 				validatorShareHolder,
	// 				preferredDepositValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			const validatorShareAddress =
	// 				await stakeManager.getValidatorContract(
	// 					preferredDepositValidatorId
	// 				);

	// 			const validatorShare = (await ethers.getContractAt(
	// 				"IValidatorShare",
	// 				validatorShareAddress
	// 			)) as IValidatorShare;

	// 			const validatorShareHolderBalance =
	// 				await validatorShare.balanceOf(
	// 					validatorShareHolder.address
	// 				);
	// 			await validatorShare
	// 				.connect(validatorShareHolder)
	// 				.transfer(maticXAddress, validatorShareHolderBalance);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.withdrawValidatorsReward([preferredDepositValidatorId]);
	// 			await expect(promise)
	// 				.to.emit(maticX, "WithdrawRewards")
	// 				.withArgs(
	// 					preferredDepositValidatorId,
	// 					validatorShareHolderBalance
	// 				);
	// 		});
	// 	});
	// });

	// describe("Stake rewards and distribute fees for POL", function () {
	// 	describe("Negative", function () {
	// 		it("Should revert with the right error if paused", async function () {
	// 			const { maticX, manager, bot, preferredDepositValidatorId } =
	// 				await loadFixture(deployFixture);

	// 			await (maticX.connect(manager) as MaticX).togglePause();

	// 			const promise = maticX
	// 				.connect(bot)
	// 				.stakeRewardsAndDistributeFees(preferredDepositValidatorId);
	// 			await expect(promise).to.be.revertedWith("Pausable: paused");
	// 		});

	// 		it("Should revert with the right error if called by a non bot", async function () {
	// 			const {
	// 				maticX,
	// 				executor,
	// 				botRole,
	// 				preferredDepositValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(executor)
	// 				.stakeRewardsAndDistributeFees(preferredDepositValidatorId);
	// 			await expect(promise).to.be.revertedWith(
	// 				`AccessControl: account ${executor.address.toLowerCase()} is missing role ${botRole}`
	// 			);
	// 		});

	// 		it("Should revert with the right error if having an unregistered validator id", async function () {
	// 			const { maticX, bot } = await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(bot)
	// 				.stakeRewardsAndDistributeFees(0);
	// 			await expect(promise).to.be.revertedWith(
	// 				"Doesn't exist in validator registry"
	// 			);
	// 		});

	// 		it("Should revert with the right error if having the zero reward", async function () {
	// 			const { maticX, bot, preferredWithdrawalValidatorId } =
	// 				await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(bot)
	// 				.stakeRewardsAndDistributeFees(
	// 					preferredWithdrawalValidatorId
	// 				);
	// 			await expect(promise).to.be.revertedWith("Reward is zero");
	// 		});
	// 	});

	// 	describe("Positive", function () {
	// 		it("Should emit the StakeRewards and DistributeFees events if having a positive fee amount", async function () {
	// 			const {
	// 				maticX,
	// 				pol,
	// 				polygonTreasury,
	// 				bot,
	// 				preferredDepositValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			await pol
	// 				.connect(polygonTreasury)
	// 				.transfer(maticXAddress, stakeAmount);

	// 			const feePercent = await maticX.feePercent();
	// 			const feeAmount = stakeAmount.mul(feePercent).div(basisPoints);
	// 			const netStakeAmount = stakeAmount.sub(feeAmount);

	// 			const treasuryAddress = await maticX.treasury();

	// 			const promise = maticX
	// 				.connect(bot)
	// 				.stakeRewardsAndDistributeFees(preferredDepositValidatorId);
	// 			await expect(promise)
	// 				.to.emit(maticX, "StakeRewards")
	// 				.withArgs(preferredDepositValidatorId, netStakeAmount)
	// 				.and.to.emit(maticX, "DistributeFees")
	// 				.withArgs(treasuryAddress, feeAmount);
	// 		});

	// 		it("Should emit the StakeRewards if having the zero fee amount", async function () {
	// 			const {
	// 				maticX,
	// 				pol,
	// 				polygonTreasury,
	// 				bot,
	// 				preferredDepositValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			const stakeAmount = 19;
	// 			await pol
	// 				.connect(polygonTreasury)
	// 				.transfer(maticXAddress, stakeAmount);

	// 			const promise = maticX
	// 				.connect(bot)
	// 				.stakeRewardsAndDistributeFees(preferredDepositValidatorId);
	// 			await expect(promise)
	// 				.to.emit(maticX, "StakeRewards")
	// 				.withArgs(preferredDepositValidatorId, stakeAmount)
	// 				.and.not.to.emit(maticX, "DistributeFees");
	// 		});

	// 		it("Should return the right POL balances", async function () {
	// 			const {
	// 				maticX,
	// 				stakeManager,
	// 				pol,
	// 				polygonTreasury,
	// 				bot,
	// 				preferredDepositValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			await pol
	// 				.connect(polygonTreasury)
	// 				.transfer(maticXAddress, stakeAmount);

	// 			const treasuryAddress = await maticX.treasury();

	// 			const feePercent = await maticX.feePercent();
	// 			const feeAmount = stakeAmount.mul(feePercent).div(basisPoints);
	// 			const netStakeAmount = stakeAmount.sub(feeAmount);

	// 			const promise = maticX
	// 				.connect(bot)
	// 				.stakeRewardsAndDistributeFees(preferredDepositValidatorId);
	// 			await expect(promise).to.changeTokenBalances(
	// 				pol,
	// 				[maticX, stakeManager, treasuryAddress],
	// 				[stakeAmount.mul(-1), netStakeAmount, feeAmount]
	// 			);
	// 		});
	// 	});
	// });

	// describe("Stake rewards and distribute fees for Matic", function () {
	// 	describe("Negative", function () {
	// 		it("Should revert with the right error if paused", async function () {
	// 			const { maticX, manager, bot, preferredDepositValidatorId } =
	// 				await loadFixture(deployFixture);

	// 			await (maticX.connect(manager) as MaticX).togglePause();

	// 			const promise = maticX
	// 				.connect(bot)
	// 				.stakeRewardsAndDistributeFeesMatic(
	// 					preferredDepositValidatorId
	// 				);
	// 			await expect(promise).to.be.revertedWith("Pausable: paused");
	// 		});

	// 		it("Should revert with the right error if called by a non bot", async function () {
	// 			const {
	// 				maticX,
	// 				executor,
	// 				botRole,
	// 				preferredDepositValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(executor)
	// 				.stakeRewardsAndDistributeFeesMatic(
	// 					preferredDepositValidatorId
	// 				);
	// 			await expect(promise).to.be.revertedWith(
	// 				`AccessControl: account ${executor.address.toLowerCase()} is missing role ${botRole}`
	// 			);
	// 		});

	// 		it("Should revert with the right error if having an unregistered validator id", async function () {
	// 			const { maticX, bot } = await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(bot)
	// 				.stakeRewardsAndDistributeFeesMatic(0);
	// 			await expect(promise).to.be.revertedWith(
	// 				"Doesn't exist in validator registry"
	// 			);
	// 		});

	// 		it("Should revert with the right error if having the zero reward", async function () {
	// 			const { maticX, bot, preferredWithdrawalValidatorId } =
	// 				await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(bot)
	// 				.stakeRewardsAndDistributeFeesMatic(
	// 					preferredWithdrawalValidatorId
	// 				);
	// 			await expect(promise).to.be.revertedWith("Reward is zero");
	// 		});
	// 	});

	// 	describe("Positive", function () {
	// 		it("Should emit the StakeRewards and DistributeFees events if having a positive fee amount", async function () {
	// 			const {
	// 				maticX,
	// 				matic,
	// 				polygonTreasury,
	// 				bot,
	// 				preferredDepositValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			await matic
	// 				.connect(polygonTreasury)
	// 				.transfer(maticXAddress, stakeAmount);

	// 			const feeAmount = stakeAmount.mul(5).div(100);
	// 			const netStakeAmount = stakeAmount.sub(feeAmount);
	// 			const treasuryAddress = await maticX.treasury();

	// 			const promise = maticX
	// 				.connect(bot)
	// 				.stakeRewardsAndDistributeFeesMatic(
	// 					preferredDepositValidatorId
	// 				);
	// 			await expect(promise)
	// 				.to.emit(maticX, "StakeRewards")
	// 				.withArgs(preferredDepositValidatorId, netStakeAmount)
	// 				.and.to.emit(maticX, "DistributeFees")
	// 				.withArgs(treasuryAddress, feeAmount);
	// 		});

	// 		it("Should emit the StakeRewards if having the zero fee amount", async function () {
	// 			const {
	// 				maticX,
	// 				matic,
	// 				polygonTreasury,
	// 				bot,
	// 				preferredDepositValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			const stakeAmount = 19;
	// 			await matic
	// 				.connect(polygonTreasury)
	// 				.transfer(maticXAddress, stakeAmount);

	// 			const promise = maticX
	// 				.connect(bot)
	// 				.stakeRewardsAndDistributeFeesMatic(
	// 					preferredDepositValidatorId
	// 				);
	// 			await expect(promise)
	// 				.to.emit(maticX, "StakeRewards")
	// 				.withArgs(preferredDepositValidatorId, stakeAmount)
	// 				.and.not.to.emit(maticX, "DistributeFees");
	// 		});

	// 		it("Should return the right Matic balances", async function () {
	// 			const {
	// 				maticX,
	// 				stakeManager,
	// 				pol,
	// 				matic,
	// 				polygonTreasury,
	// 				bot,
	// 				preferredDepositValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			await matic
	// 				.connect(polygonTreasury)
	// 				.transfer(maticXAddress, stakeAmount);

	// 			const treasuryAddress = await maticX.treasury();

	// 			const feeAmount = stakeAmount.mul(5).div(100);
	// 			const netStakeAmount = stakeAmount.sub(feeAmount);

	// 			const promise = maticX
	// 				.connect(bot)
	// 				.stakeRewardsAndDistributeFeesMatic(
	// 					preferredDepositValidatorId
	// 				);
	// 			await expect(promise).to.changeTokenBalances(
	// 				matic,
	// 				[maticX, treasuryAddress],
	// 				[stakeAmount.mul(-1), feeAmount]
	// 			);
	// 			await expect(promise).to.changeTokenBalance(
	// 				pol,
	// 				stakeManager,
	// 				netStakeAmount
	// 			);
	// 		});
	// 	});
	// });

	// describe("Migrate a delegation", function () {
	// 	describe("Negative", function () {
	// 		it("Should revert with the right error if paused", async function () {
	// 			const {
	// 				maticX,
	// 				manager,
	// 				preferredDepositValidatorId,
	// 				preferredWithdrawalValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			await (maticX.connect(manager) as MaticX).togglePause();

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.migrateDelegation(
	// 					preferredDepositValidatorId,
	// 					preferredWithdrawalValidatorId,
	// 					stakeAmount
	// 				);
	// 			await expect(promise).to.be.revertedWith("Pausable: paused");
	// 		});

	// 		it("Should revert with the right error if called by a non admin", async function () {
	// 			const {
	// 				maticX,
	// 				executor,
	// 				defaultAdminRole,
	// 				preferredDepositValidatorId,
	// 				preferredWithdrawalValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(executor)
	// 				.migrateDelegation(
	// 					preferredDepositValidatorId,
	// 					preferredWithdrawalValidatorId,
	// 					stakeAmount
	// 				);
	// 			await expect(promise).to.be.revertedWith(
	// 				`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
	// 			);
	// 		});

	// 		it("Should revert with the right error if passing an unregistered source validator id", async function () {
	// 			const { maticX, manager, preferredWithdrawalValidatorId } =
	// 				await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.migrateDelegation(
	// 					0,
	// 					preferredWithdrawalValidatorId,
	// 					stakeAmount
	// 				);
	// 			await expect(promise).to.be.revertedWith(
	// 				"From validator id does not exist in our registry"
	// 			);
	// 		});

	// 		it("Should revert with the right error if passing an unregistered destination validator id", async function () {
	// 			const { maticX, manager, preferredDepositValidatorId } =
	// 				await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.migrateDelegation(
	// 					preferredDepositValidatorId,
	// 					0,
	// 					stakeAmount
	// 				);
	// 			await expect(promise).to.be.revertedWith(
	// 				"To validator id does not exist in our registry"
	// 			);
	// 		});

	// 		it("Should revert with the right error if passing zero amount", async function () {
	// 			const {
	// 				maticX,
	// 				manager,
	// 				preferredDepositValidatorId,
	// 				preferredWithdrawalValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.migrateDelegation(
	// 					preferredDepositValidatorId,
	// 					preferredWithdrawalValidatorId,
	// 					0
	// 				);
	// 			await expect(promise).to.be.revertedWith("Amount is zero");
	// 		});

	// 		it("Should revert with the right error if having the zero delegated amount", async function () {
	// 			const {
	// 				maticX,
	// 				manager,
	// 				preferredDepositValidatorId,
	// 				preferredWithdrawalValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.migrateDelegation(
	// 					preferredDepositValidatorId,
	// 					preferredWithdrawalValidatorId,
	// 					1
	// 				);
	// 			await expect(promise).to.be.revertedWith(
	// 				"Available delegation amount is zero"
	// 			);
	// 		});
	// 	});

	// 	describe("Positive", function () {
	// 		it("Should emit the MigrateDelegation event if having a sufficient source validator balance", async function () {
	// 			const {
	// 				maticX,
	// 				pol,
	// 				manager,
	// 				stakerA,
	// 				preferredDepositValidatorId,
	// 				preferredWithdrawalValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			await (pol.connect(stakerA) as IERC20).approve(
	// 				maticXAddress,
	// 				stakeAmount
	// 			);
	// 			await (maticX.connect(stakerA) as MaticX).submitPOL(
	// 				stakeAmount
	// 			);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.migrateDelegation(
	// 					preferredDepositValidatorId,
	// 					preferredWithdrawalValidatorId,
	// 					stakeAmount
	// 				);
	// 			await expect(promise).to.emit(maticX, "MigrateDelegation");
	// 		});

	// 		it("Should emit the MigrateDelegation event if having an sufficient source validator balance", async function () {
	// 			const {
	// 				maticX,
	// 				pol,
	// 				manager,
	// 				stakerA,
	// 				preferredDepositValidatorId,
	// 				preferredWithdrawalValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			const requestedWithdrawalAmount = 1;
	// 			await (pol.connect(stakerA) as IERC20).approve(
	// 				maticXAddress,
	// 				stakeAmount
	// 			);
	// 			await (maticX.connect(stakerA) as MaticX).submitPOL(
	// 				stakeAmount
	// 			);
	// 			await maticX
	// 				.connect(stakerA)
	// 				.requestWithdraw(requestedWithdrawalAmount);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.migrateDelegation(
	// 					preferredDepositValidatorId,
	// 					preferredWithdrawalValidatorId,
	// 					stakeAmount.sub(requestedWithdrawalAmount)
	// 				);
	// 			await expect(promise).to.emit(maticX, "MigrateDelegation");
	// 		});

	// 		it("Should return the right total stake of the source validator", async function () {
	// 			const {
	// 				maticX,
	// 				stakeManager,
	// 				pol,
	// 				manager,
	// 				stakerA,
	// 				preferredDepositValidatorId,
	// 				preferredWithdrawalValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			await (pol.connect(stakerA) as IERC20).approve(
	// 				maticXAddress,
	// 				stakeAmount
	// 			);
	// 			await (maticX.connect(stakerA) as MaticX).submitPOL(
	// 				stakeAmount
	// 			);

	// 			const fromValidatorShareAddress =
	// 				await stakeManager.getValidatorContract(
	// 					preferredDepositValidatorId
	// 				);
	// 			const [initialTotalStake] = await maticX.getTotalStake(
	// 				fromValidatorShareAddress
	// 			);

	// 			await maticX
	// 				.connect(manager)
	// 				.migrateDelegation(
	// 					preferredDepositValidatorId,
	// 					preferredWithdrawalValidatorId,
	// 					stakeAmount
	// 				);

	// 			const [currentTotalStake] = await maticX.getTotalStake(
	// 				fromValidatorShareAddress
	// 			);
	// 			expect(currentTotalStake).not.to.equal(initialTotalStake);
	// 			expect(currentTotalStake).to.equal(0);
	// 		});

	// 		it("Should return the right total stake of the destination validator", async function () {
	// 			const {
	// 				maticX,
	// 				stakeManager,
	// 				pol,
	// 				manager,
	// 				stakerA,
	// 				preferredDepositValidatorId,
	// 				preferredWithdrawalValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			await (pol.connect(stakerA) as IERC20).approve(
	// 				maticXAddress,
	// 				stakeAmount
	// 			);
	// 			await (maticX.connect(stakerA) as MaticX).submitPOL(
	// 				stakeAmount
	// 			);

	// 			const toValidatorShareAddress =
	// 				await stakeManager.getValidatorContract(
	// 					preferredWithdrawalValidatorId
	// 				);
	// 			const [initialTotalStake] = await maticX.getTotalStake(
	// 				toValidatorShareAddress
	// 			);

	// 			await maticX
	// 				.connect(manager)
	// 				.migrateDelegation(
	// 					preferredDepositValidatorId,
	// 					preferredWithdrawalValidatorId,
	// 					stakeAmount
	// 				);

	// 			const [currentTotalStake] = await maticX.getTotalStake(
	// 				toValidatorShareAddress
	// 			);
	// 			expect(currentTotalStake).not.to.equal(initialTotalStake);
	// 			expect(currentTotalStake).to.equal(stakeAmount);
	// 		});
	// 	});
	// });

	// describe("Set a fee percent", function () {
	// 	describe("Negative", function () {
	// 		it("Should revert with the right error if called by a non admin", async function () {
	// 			const { maticX, stakerA, defaultAdminRole } =
	// 				await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(stakerA)
	// 				.setFeePercent(maxFeePercent);
	// 			await expect(promise).to.be.revertedWith(
	// 				`AccessControl: account ${stakerA.address.toLowerCase()} is missing role ${defaultAdminRole}`
	// 			);
	// 		});

	// 		it("Should revert with the right error if passing a too high fee percent", async function () {
	// 			const { maticX, manager } = await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.setFeePercent(maxFeePercent + 1);
	// 			await expect(promise).to.be.revertedWith(
	// 				"Fee percent is too high"
	// 			);
	// 		});
	// 	});

	// 	describe("Positive", function () {
	// 		it("Should emit the SetFeePercent event if having zero rewards", async function () {
	// 			const { maticX, manager } = await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.setFeePercent(maxFeePercent);
	// 			await expect(promise)
	// 				.to.emit(maticX, "SetFeePercent")
	// 				.withArgs(maxFeePercent);

	// 			await expect(promise)
	// 				.not.to.emit(maticX, "StakeRewards")
	// 				.and.not.to.emit(maticX, "DistributeFees");
	// 		});

	// 		it("Should emit the SetFeePercent, StakeRewards and DistributeFees events if having non zero rewards", async function () {
	// 			const {
	// 				maticX,
	// 				pol,
	// 				polygonTreasury,
	// 				manager,
	// 				preferredDepositValidatorId,
	// 			} = await loadFixture(deployFixture);

	// 			await pol
	// 				.connect(polygonTreasury)
	// 				.transfer(maticXAddress, stakeAmount);

	// 			const feePercent = await maticX.feePercent();
	// 			const feeAmount = stakeAmount.mul(feePercent).div(basisPoints);
	// 			const netStakeAmount = stakeAmount.sub(feeAmount);

	// 			const treasuryAddress = await maticX.treasury();

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.setFeePercent(maxFeePercent);
	// 			await expect(promise).to.emit(maticX, "SetFeePercent");
	// 			await expect(promise)
	// 				.to.emit(maticX, "StakeRewards")
	// 				.withArgs(preferredDepositValidatorId, netStakeAmount)
	// 				.and.to.emit(maticX, "DistributeFees")
	// 				.withArgs(treasuryAddress, feeAmount);
	// 		});
	// 	});
	// });

	// describe("Set a treasury address", function () {
	// 	const treasuryAddress = generateRandomAddress();

	// 	describe("Negative", function () {
	// 		it("Should revert with the right error if called by a non admin", async function () {
	// 			const { maticX, stakerA, defaultAdminRole } =
	// 				await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(stakerA)
	// 				.setTreasury(treasuryAddress);
	// 			await expect(promise).to.be.revertedWith(
	// 				`AccessControl: account ${stakerA.address.toLowerCase()} is missing role ${defaultAdminRole}`
	// 			);
	// 		});

	// 		it("Should revert with the right error if passing the zero treasury address", async function () {
	// 			const { maticX, manager } = await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.setTreasury(ethers.ZeroAddress);
	// 			await expect(promise).to.be.revertedWith(
	// 				"Zero treasury address"
	// 			);
	// 		});
	// 	});

	// 	describe("Positive", function () {
	// 		it("Should emit the SetTreasury event", async function () {
	// 			const { maticX, manager } = await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.setTreasury(treasuryAddress);
	// 			await expect(promise)
	// 				.to.emit(maticX, "SetTreasury")
	// 				.withArgs(treasuryAddress);
	// 		});
	// 	});
	// });

	// describe("Set a validator registry address", function () {
	// 	const validatorRegistryAddress = generateRandomAddress();

	// 	describe("Negative", function () {
	// 		it("Should revert with the right error if called by a non admin", async function () {
	// 			const { maticX, stakerA, defaultAdminRole } =
	// 				await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(stakerA)
	// 				.setValidatorRegistry(validatorRegistryAddress);
	// 			await expect(promise).to.be.revertedWith(
	// 				`AccessControl: account ${stakerA.address.toLowerCase()} is missing role ${defaultAdminRole}`
	// 			);
	// 		});

	// 		it("Should revert with the right error if passing the zero treasury address", async function () {
	// 			const { maticX, manager } = await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.setValidatorRegistry(ethers.ZeroAddress);
	// 			await expect(promise).to.be.revertedWith(
	// 				"Zero validator registry address"
	// 			);
	// 		});
	// 	});

	// 	describe("Positive", function () {
	// 		it("Should emit the SetValidatorRegistry event", async function () {
	// 			const { maticX, manager } = await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.setValidatorRegistry(validatorRegistryAddress);
	// 			await expect(promise)
	// 				.to.emit(maticX, "SetValidatorRegistry")
	// 				.withArgs(validatorRegistryAddress);
	// 		});
	// 	});
	// });

	// describe("Set a fx state root tunnel address", function () {
	// 	const fxStateRootTunnelAddress = generateRandomAddress();

	// 	describe("Negative", function () {
	// 		it("Should revert with the right error if called by a non admin", async function () {
	// 			const { maticX, stakerA, defaultAdminRole } =
	// 				await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(stakerA)
	// 				.setFxStateRootTunnel(fxStateRootTunnelAddress);
	// 			await expect(promise).to.be.revertedWith(
	// 				`AccessControl: account ${stakerA.address.toLowerCase()} is missing role ${defaultAdminRole}`
	// 			);
	// 		});

	// 		it("Should revert with the right error if passing the zero fx state root tunnel address", async function () {
	// 			const { maticX, manager } = await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.setFxStateRootTunnel(ethers.ZeroAddress);
	// 			await expect(promise).to.be.revertedWith(
	// 				"Zero fx state root tunnel address"
	// 			);
	// 		});
	// 	});

	// 	describe("Positive", function () {
	// 		it("Should emit the SetFxStateRootTunnel event", async function () {
	// 			const { maticX, manager } = await loadFixture(deployFixture);

	// 			const promise = maticX
	// 				.connect(manager)
	// 				.setFxStateRootTunnel(fxStateRootTunnelAddress);
	// 			await expect(promise)
	// 				.to.emit(maticX, "SetFxStateRootTunnel")
	// 				.withArgs(fxStateRootTunnelAddress);
	// 		});
	// 	});
	// });

	// describe("Set a version", function () {
	// 	describe("Negative", function () {
	// 		it("Should revert with the right error if called by a non admin", async function () {
	// 			const { maticX, executor, defaultAdminRole } =
	// 				await loadFixture(deployFixture);

	// 			const promise = maticX.connect(executor).setVersion(version);
	// 			await expect(promise).to.be.revertedWith(
	// 				`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
	// 			);
	// 		});

	// 		it("Should revert with the right error if passing an empty version", async function () {
	// 			const { maticX, manager } = await loadFixture(deployFixture);

	// 			const promise = (maticX.connect(manager) as MaticX).setVersion(
	// 				""
	// 			);
	// 			await expect(promise).to.be.revertedWith("Empty version");
	// 		});
	// 	});

	// 	describe("Positive", function () {
	// 		it("Should emit the SetVersion event", async function () {
	// 			const { maticX, manager } = await loadFixture(deployFixture);

	// 			const promise = (maticX.connect(manager) as MaticX).setVersion(
	// 				version
	// 			);
	// 			await expect(promise)
	// 				.to.emit(maticX, "SetVersion")
	// 				.withArgs(version);
	// 		});
	// 	});
	// });

	// describe("Toggle a pause", function () {
	// 	describe("Negative", function () {
	// 		it("Should revert with the right error if called by a non admin", async function () {
	// 			const { maticX, executor, defaultAdminRole } =
	// 				await loadFixture(deployFixture);

	// 			const promise = maticX.connect(executor).togglePause();
	// 			await expect(promise).to.be.revertedWith(
	// 				`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
	// 			);
	// 		});
	// 	});

	// 	describe("Positive", function () {
	// 		it("Should emit the Paused event if pausing", async function () {
	// 			const { maticX, manager } = await loadFixture(deployFixture);

	// 			const promise = (
	// 				maticX.connect(manager) as MaticX
	// 			).togglePause();
	// 			await expect(promise)
	// 				.to.emit(maticX, "Paused")
	// 				.withArgs(manager.address);
	// 		});

	// 		it("Should emit the Unpaused event if pausing", async function () {
	// 			const { maticX, manager } = await loadFixture(deployFixture);

	// 			await (maticX.connect(manager) as MaticX).togglePause();

	// 			const promise = (
	// 				maticX.connect(manager) as MaticX
	// 			).togglePause();
	// 			await expect(promise)
	// 				.to.emit(maticX, "Unpaused")
	// 				.withArgs(manager.address);
	// 		});

	// 		it("Should return the right paused status if toggling once", async function () {
	// 			const { maticX, manager } = await loadFixture(deployFixture);

	// 			await (maticX.connect(manager) as MaticX).togglePause();

	// 			const paused = await maticX.paused();
	// 			expect(paused).to.be.true;
	// 		});

	// 		it("Should return the right paused status if toggling twice", async function () {
	// 			const { maticX, manager } = await loadFixture(deployFixture);

	// 			await (maticX.connect(manager) as MaticX).togglePause();
	// 			await (maticX.connect(manager) as MaticX).togglePause();

	// 			const paused = await maticX.paused();
	// 			expect(paused).to.be.false;
	// 		});
	// 	});
	// });
});
