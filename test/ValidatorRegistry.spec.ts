import {
	loadFixture,
	reset,
	setBalance,
} from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { IMaticX, ValidatorRegistry } from "../typechain-types";
import { generateRandomAddress } from "../utils/account";
import { extractEnvironmentVariables } from "../utils/environment";
import { getProviderUrl, Network } from "../utils/network";

const envVars = extractEnvironmentVariables();

const providerUrl = getProviderUrl(
	Network.Ethereum,
	envVars.RPC_PROVIDER,
	envVars.ETHEREUM_API_KEY
);

describe("ValidatorRegistry", function () {
	const validatorIds = [128n, 72n];
	const version = "2";

	async function deployFixture(callValidatorRegistryInitializeV2 = true) {
		await reset(providerUrl, envVars.FORKING_BLOCK_NUMBER);

		// EOA definitions
		const manager = await impersonateAccount(
			"0x80A43dd35382C4919991C5Bca7f46Dd24Fde4C67"
		);
		const [executor, bot, treasury] = await ethers.getSigners();

		// Contract definitions
		const stakeManager = await ethers.getContractAt(
			"IStakeManager",
			"0x5e3Ef299fDDf15eAa0432E6e66473ace8c13D908"
		);
		const stakeManagerAddress = await stakeManager.getAddress();

		const matic = await ethers.getContractAt(
			"IERC20",
			"0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0"
		);
		const maticAddress = await matic.getAddress();

		const pol = await ethers.getContractAt(
			"IERC20",
			"0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6"
		);
		const polAddress = await pol.getAddress();

		const ValidatorRegistry =
			await ethers.getContractFactory("ValidatorRegistry");
		const validatorRegistry = await upgrades.deployProxy(
			ValidatorRegistry,
			[
				stakeManagerAddress,
				maticAddress,
				ethers.ZeroAddress,
				manager.address,
			]
		);
		const validatorRegistryAddress = await validatorRegistry.getAddress();

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
		if (callValidatorRegistryInitializeV2) {
			await (
				validatorRegistry.connect(manager) as ValidatorRegistry
			).initializeV2(polAddress);
		}

		const defaultAdminRole = await validatorRegistry.DEFAULT_ADMIN_ROLE();
		const botRole = await validatorRegistry.BOT();

		await (
			validatorRegistry.connect(manager) as ValidatorRegistry
		).setMaticX(maticXAddress);
		await (
			validatorRegistry.connect(manager) as ValidatorRegistry
		).grantRole(botRole, bot.address);

		return {
			validatorRegistry,
			validatorRegistryAddress,
			stakeManager,
			stakeManagerAddress,
			maticX,
			maticXAddress,
			matic,
			maticAddress,
			pol,
			polAddress,
			manager,
			executor,
			bot,
			defaultAdminRole,
			botRole,
		};
	}

	async function impersonateAccount(address: string) {
		setBalance(address, ethers.parseEther("10000"));
		return await ethers.getImpersonatedSigner(address);
	}

	describe("Deploy the contract", function () {
		describe("Negative", function () {
			it("Should revert with the right error if passing the zero validator registry address", async function () {
				const { maticXAddress, maticAddress, manager } =
					await loadFixture(deployFixture);

				const ValidatorRegistry =
					await ethers.getContractFactory("ValidatorRegistry");
				const promise = upgrades.deployProxy(ValidatorRegistry, [
					ethers.ZeroAddress,
					maticAddress,
					maticXAddress,
					manager.address,
				]);
				await expect(promise).to.be.revertedWith(
					"Zero stake manager address"
				);
			});

			it("Should revert with the right error if passing the zero Matic token address", async function () {
				const { stakeManagerAddress, maticXAddress, manager } =
					await loadFixture(deployFixture);

				const ValidatorRegistry =
					await ethers.getContractFactory("ValidatorRegistry");
				const promise = upgrades.deployProxy(ValidatorRegistry, [
					stakeManagerAddress,
					ethers.ZeroAddress,
					maticXAddress,
					manager.address,
				]);
				await expect(promise).to.be.revertedWith(
					"Zero Matic token address"
				);
			});

			it("Should revert with the right error if passing the zero Matic token address", async function () {
				const { stakeManagerAddress, maticXAddress, maticAddress } =
					await loadFixture(deployFixture);

				const ValidatorRegistry =
					await ethers.getContractFactory("ValidatorRegistry");
				const promise = upgrades.deployProxy(ValidatorRegistry, [
					stakeManagerAddress,
					maticAddress,
					maticXAddress,
					ethers.ZeroAddress,
				]);
				await expect(promise).to.be.revertedWith(
					"Zero manager address"
				);
			});

			it("Should revert with the right error if reinitializing", async function () {
				const {
					validatorRegistry,
					stakeManagerAddress,
					maticAddress,
					maticXAddress,
					manager,
				} = await loadFixture(deployFixture);

				const promise = validatorRegistry.initialize(
					stakeManagerAddress,
					maticAddress,
					maticXAddress,
					manager.address
				);
				await expect(promise).to.be.revertedWith(
					"Initializable: contract is already initialized"
				);
			});

			it("Should revert with the right error if passing an invalid validator index", async function () {
				const { validatorRegistry } = await loadFixture(deployFixture);

				const promise = validatorRegistry.getValidatorId(0);
				await expect(promise).to.be.revertedWith(
					"Validator id does not exist"
				);
			});
		});

		describe("Positive", function () {
			it("Should return the default admin role set for the manager", async function () {
				const { validatorRegistry, manager, defaultAdminRole } =
					await loadFixture(deployFixture);

				const hasRole: boolean = await validatorRegistry.hasRole(
					defaultAdminRole,
					manager.address
				);
				expect(hasRole).to.be.true;
			});

			it("Should return the right paused status", async function () {
				const { validatorRegistry } = await loadFixture(deployFixture);

				const paused: boolean = await validatorRegistry.paused();
				expect(paused).to.be.false;
			});

			it("Should return the right version", async function () {
				const { validatorRegistry } = await loadFixture(deployFixture);

				const currentVersion: string =
					await validatorRegistry.version();
				expect(currentVersion).to.equal(version);
			});

			it("Should return the right contract addresses", async function () {
				const {
					validatorRegistry,
					stakeManagerAddress,
					maticXAddress,
					maticAddress,
					polAddress,
				} = await loadFixture(deployFixture);

				const [
					currentStakeManagerAddress,
					currentMaticAddress,
					currentMaticXAddress,
					currentPolAddress,
				]: [string, string, string, string] =
					await validatorRegistry.getContracts();
				expect(currentStakeManagerAddress).to.equal(
					stakeManagerAddress
				);
				expect(currentMaticAddress).to.equal(maticAddress);
				expect(currentMaticXAddress).to.equal(maticXAddress);
				expect(currentPolAddress).to.equal(polAddress);
			});

			it("Should return the right validator ids", async function () {
				const { validatorRegistry } = await loadFixture(deployFixture);

				const currentValidatorIds: bigint[] =
					await validatorRegistry.getValidators();
				expect(currentValidatorIds).to.be.empty;
			});
		});
	});

	describe("Upgrade the contract", function () {
		describe("Checks", function () {
			it("Should return a new address of the implementation if extended", async function () {
				const { validatorRegistry, validatorRegistryAddress } =
					await loadFixture(deployFixture);

				const initialImplementationAddress: string =
					await upgrades.erc1967.getImplementationAddress(
						validatorRegistryAddress
					);

				const ExtendedValidatorRegistryMock =
					await ethers.getContractFactory(
						"ExtendedValidatorRegistryMock"
					);
				await upgrades.upgradeProxy(
					validatorRegistry,
					ExtendedValidatorRegistryMock
				);

				const currentImplementationAddress: string =
					await upgrades.erc1967.getImplementationAddress(
						validatorRegistryAddress
					);
				expect(initialImplementationAddress).not.to.equal(
					currentImplementationAddress
				);
			});

			it("Should return the same address of the implementation if not extended", async function () {
				const { validatorRegistry, validatorRegistryAddress } =
					await loadFixture(deployFixture);

				const initialImplementationAddress: string =
					await upgrades.erc1967.getImplementationAddress(
						validatorRegistryAddress
					);

				const ValidatorRegistry =
					await ethers.getContractFactory("ValidatorRegistry");
				await upgrades.upgradeProxy(
					validatorRegistry,
					ValidatorRegistry
				);

				const currentImplementationAddress: string =
					await upgrades.erc1967.getImplementationAddress(
						validatorRegistryAddress
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
				const { validatorRegistryAddress, executor } =
					await loadFixture(deployFixture);

				const iface = new ethers.Interface([
					"function foobar(uint256)",
				]);
				const promise = executor.sendTransaction({
					to: validatorRegistryAddress,
					data: iface.encodeFunctionData("foobar", [1n]),
				});
				await expect(promise).to.be.reverted;
			});

			it("Should revert if sending arbitrary data", async function () {
				const { validatorRegistryAddress, executor } =
					await loadFixture(deployFixture);

				const promise = executor.sendTransaction({
					to: validatorRegistryAddress,
					data: "0x01",
				});
				await expect(promise).to.be.reverted;
			});

			it("Should revert if sending no data", async function () {
				const { validatorRegistryAddress, executor } =
					await loadFixture(deployFixture);

				const promise = executor.sendTransaction({
					to: validatorRegistryAddress,
				});
				await expect(promise).to.be.reverted;
			});
		});
	});

	describe("Grant a role", function () {
		describe("Negative", function () {
			it("Should revert with the right error if called by a non admin", async function () {
				const { validatorRegistry, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(executor) as ValidatorRegistry
				).grantRole(defaultAdminRole, executor.address);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the RoleGranted event", async function () {
				const {
					validatorRegistry,
					manager,
					executor,
					defaultAdminRole,
				} = await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).grantRole(defaultAdminRole, executor.address);
				await expect(promise)
					.to.emit(validatorRegistry, "RoleGranted")
					.withArgs(
						defaultAdminRole,
						executor.address,
						manager.address
					);
			});

			it("Should return the right status of the granted role", async function () {
				const {
					validatorRegistry,
					manager,
					executor,
					defaultAdminRole,
				} = await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).grantRole(defaultAdminRole, executor.address);

				const hasRole: boolean = await validatorRegistry.hasRole(
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
				const { validatorRegistry, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(executor) as ValidatorRegistry
				).revokeRole(defaultAdminRole, executor.address);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the RoleRevoked event", async function () {
				const {
					validatorRegistry,
					manager,
					executor,
					defaultAdminRole,
				} = await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).grantRole(defaultAdminRole, executor.address);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).revokeRole(defaultAdminRole, executor.address);
				await expect(promise)
					.to.emit(validatorRegistry, "RoleRevoked")
					.withArgs(
						defaultAdminRole,
						executor.address,
						manager.address
					);
			});

			it("Should return the right status of the revoked role", async function () {
				const {
					validatorRegistry,
					manager,
					executor,
					defaultAdminRole,
				} = await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).grantRole(defaultAdminRole, executor.address);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).revokeRole(defaultAdminRole, executor.address);

				const hasRole: boolean = await validatorRegistry.hasRole(
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
				const {
					validatorRegistry,
					manager,
					executor,
					defaultAdminRole,
				} = await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).renounceRole(defaultAdminRole, executor.address);
				await expect(promise).to.be.revertedWith(
					"AccessControl: can only renounce roles for self"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the RoleRevoked event", async function () {
				const { validatorRegistry, manager, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).renounceRole(defaultAdminRole, manager.address);
				await expect(promise)
					.to.emit(validatorRegistry, "RoleRevoked")
					.withArgs(
						defaultAdminRole,
						manager.address,
						manager.address
					);
			});

			it("Should return the right status of the revoked role", async function () {
				const { validatorRegistry, manager, defaultAdminRole } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).renounceRole(defaultAdminRole, manager.address);

				const hasRole: boolean = await validatorRegistry.hasRole(
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
				const { validatorRegistry, polAddress, manager } =
					await loadFixture(deployFixture.bind(null, false));

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).initializeV2(polAddress);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).initializeV2(polAddress);
				await expect(promise).to.be.revertedWith(
					"Initializable: contract is already initialized"
				);
			});

			it("Should revert with the right error if called by a non admin", async function () {
				const {
					validatorRegistry,
					polAddress,
					executor,
					defaultAdminRole,
				} = await loadFixture(deployFixture.bind(null, false));

				const promise = (
					validatorRegistry.connect(executor) as ValidatorRegistry
				).initializeV2(polAddress);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing the zero pol token address", async function () {
				const { validatorRegistry, manager } = await loadFixture(
					deployFixture.bind(null, false)
				);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).initializeV2(ethers.ZeroAddress);
				await expect(promise).to.be.revertedWith(
					"Zero POL token address"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the Initialized event", async function () {
				const { validatorRegistry, polAddress, manager } =
					await loadFixture(deployFixture.bind(null, false));

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).initializeV2(polAddress);
				await expect(promise)
					.to.emit(validatorRegistry, "Initialized")
					.withArgs(2);
			});

			it("Should return the right version", async function () {
				const { validatorRegistry, polAddress, manager } =
					await loadFixture(deployFixture.bind(null, false));

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).initializeV2(polAddress);

				const currentVersion = await validatorRegistry.version();
				expect(currentVersion).to.equal(version);
			});

			it("Should return the right contract addresses", async function () {
				const {
					validatorRegistry,
					stakeManagerAddress,
					maticAddress,
					maticXAddress,
					polAddress,
					manager,
				} = await loadFixture(deployFixture.bind(null, false));

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).initializeV2(polAddress);

				const [
					currentStakeManagerAddress,
					currentMaticAddress,
					currentMaticXAddress,
					currentPolAddress,
				]: [string, string, string, string] =
					await validatorRegistry.getContracts();
				expect(currentStakeManagerAddress).to.equal(
					stakeManagerAddress
				);
				expect(currentMaticAddress).to.equal(maticAddress);
				expect(currentMaticXAddress).to.equal(maticXAddress);
				expect(currentPolAddress).to.equal(polAddress);
			});
		});
	});

	describe("Add a validator", function () {
		describe("Negative", function () {
			it("Should revert with the right error if paused", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).togglePause();

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

			it("Should revert with the right error if called by a non admin", async function () {
				const { validatorRegistry, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(executor) as ValidatorRegistry
				).addValidator(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing the zero validator id", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(0);
				await expect(promise).to.revertedWith("Zero validator id");
			});

			it("Should revert with the right error if having an already existing validator", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					"Validator id already exists in our registry"
				);
			});

			it("Should revert with the right error if having no validator share", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(10_000n);
				await expect(promise).to.be.revertedWith(
					"Validator has no validator share"
				);
			});

			it("Should revert with the right error if having no active validator", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(1);
				await expect(promise).to.be.revertedWith(
					"Validator isn't active"
				);
			});

			it("Should revert with the right error if passing an invalid validator index", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				const promise = validatorRegistry.getValidatorId(1n);
				await expect(promise).to.be.revertedWith(
					"Validator id does not exist"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the AddValidator event", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);
				await expect(promise)
					.to.emit(validatorRegistry, "AddValidator")
					.withArgs(validatorIds[0]);
			});

			it("Should return the right validator ids", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				for (const validatorId of validatorIds) {
					await (
						validatorRegistry.connect(manager) as ValidatorRegistry
					).addValidator(validatorId);
				}

				const currentValidatorIds: bigint[] =
					await validatorRegistry.getValidators();
				expect(currentValidatorIds).to.have.lengthOf(
					validatorIds.length
				);
				for (const [i, validatorId] of currentValidatorIds.entries()) {
					expect(validatorId).to.equal(currentValidatorIds[i]);
				}
			});

			it("Should return the right validator id", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				const currentValidatorId: bigint =
					await validatorRegistry.getValidatorId(0n);
				expect(currentValidatorId).to.equal(validatorIds[0]);
			});

			it("Should return the right validators existence", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				for (const validatorId of validatorIds) {
					await (
						validatorRegistry.connect(manager) as ValidatorRegistry
					).addValidator(validatorId);
				}

				for (const validatorId of validatorIds) {
					const currentValidatorIdExists: boolean =
						await validatorRegistry.validatorIdExists(validatorId);
					expect(currentValidatorIdExists).to.be.true;
				}
			});
		});
	});

	describe("Remove a validator", function () {
		describe("Negative", function () {
			it("Should revert with the right error if paused", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).togglePause();

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).removeValidator(validatorIds[0], false);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

			it("Should revert with the right error if called by a non admin", async function () {
				const {
					validatorRegistry,
					executor,
					manager,
					defaultAdminRole,
				} = await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				const promise = (
					validatorRegistry.connect(executor) as ValidatorRegistry
				).removeValidator(validatorIds[0], false);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing the zero validator id", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).removeValidator(0n, false);
				await expect(promise).to.revertedWith("Zero validator id");
			});

			it("Should revert with the right error if having no existing validator", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).removeValidator(validatorIds[0], false);
				await expect(promise).to.be.revertedWith(
					"Validator id doesn't exist in our registry"
				);
			});

			it("Should revert with the right error if having the deposit validator set as preferred", async function () {
				const { validatorRegistry, manager, bot } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				await (
					validatorRegistry.connect(bot) as ValidatorRegistry
				).setPreferredDepositValidatorId(validatorIds[0]);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).removeValidator(validatorIds[0], false);
				await expect(promise).to.be.revertedWith(
					"Can't remove a preferred validator for deposits"
				);
			});

			it("Should revert with the right error if having the withdrawal validator set as preferred", async function () {
				const { validatorRegistry, manager, bot } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				await (
					validatorRegistry.connect(bot) as ValidatorRegistry
				).setPreferredWithdrawalValidatorId(validatorIds[0]);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).removeValidator(validatorIds[0], false);
				await expect(promise).to.be.revertedWith(
					"Can't remove a preferred validator for withdrawals"
				);
			});

			it("Should revert with the right error if having some validator shares and the ignore balance flag unset", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const maticX = (await ethers.getContractAt(
					"IMaticX",
					"0xf03A7Eb46d01d9EcAA104558C732Cf82f6B6B645"
				)) as IMaticX;
				const maticXAddress: string = await maticX.getAddress();

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).setMaticX(maticXAddress);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).removeValidator(validatorIds[0], false);
				await expect(promise).to.be.revertedWith(
					"Validator has some shares left"
				);
			});

			it("Shouldn't revert with an error if having some validator shares and the ignore balance flag set", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const maticX = (await ethers.getContractAt(
					"IMaticX",
					"0xf03A7Eb46d01d9EcAA104558C732Cf82f6B6B645"
				)) as IMaticX;
				const maticXAddress: string = await maticX.getAddress();

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).setMaticX(maticXAddress);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).removeValidator(validatorIds[0], true);
				await expect(promise).not.to.be.reverted;
			});

			it("Should revert with the right error if getting a removed validator id", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).removeValidator(validatorIds[0], false);

				const promise = validatorRegistry.getValidatorId(0);
				await expect(promise).to.be.revertedWith(
					"Validator id does not exist"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the RemoveValidator event if having the ignore balance flag unset", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).removeValidator(validatorIds[0], false);
				await expect(promise)
					.to.emit(validatorRegistry, "RemoveValidator")
					.withArgs(validatorIds[0]);
			});

			it("Should emit the RemoveValidator event if having the ignore balance flag set", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).removeValidator(validatorIds[0], true);
				await expect(promise)
					.to.emit(validatorRegistry, "RemoveValidator")
					.withArgs(validatorIds[0]);
			});

			it("Should return the right validator ids", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				for (const validatorId of validatorIds) {
					await (
						validatorRegistry.connect(manager) as ValidatorRegistry
					).addValidator(validatorId);
				}

				const initialValidatorIds: bigint[] =
					await validatorRegistry.getValidators();

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).removeValidator(validatorIds[0], false);

				const currentValidatorIds: bigint[] =
					await validatorRegistry.getValidators();
				expect(currentValidatorIds).not.to.equal(initialValidatorIds);
				expect(currentValidatorIds).to.have.lengthOf(
					validatorIds.length - 1
				);
				expect(currentValidatorIds[0]).to.equal(validatorIds[1]);
			});
		});
	});

	describe("Set the preferred deposit validator id", function () {
		describe("Negative", function () {
			it("Should revert with the right error if paused", async function () {
				const { validatorRegistry, manager, bot } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).togglePause();

				const promise = (
					validatorRegistry.connect(bot) as ValidatorRegistry
				).setPreferredDepositValidatorId(validatorIds[0]);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

			it("Should revert with the right error if called by a non admin", async function () {
				const { validatorRegistry, executor, manager, botRole } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				const promise = (
					validatorRegistry.connect(executor) as ValidatorRegistry
				).setPreferredDepositValidatorId(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${botRole}`
				);
			});

			it("Should revert with the right error if passing the zero validator id", async function () {
				const { validatorRegistry, manager, bot } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				const promise = (
					validatorRegistry.connect(bot) as ValidatorRegistry
				).setPreferredDepositValidatorId(0n);
				await expect(promise).to.revertedWith("Zero validator id");
			});

			it("Should revert with the right error if having no existing validator", async function () {
				const { validatorRegistry, bot } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(bot) as ValidatorRegistry
				).setPreferredDepositValidatorId(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					"Validator id doesn't exist in our registry"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the SetPreferredDepositValidatorId event", async function () {
				const { validatorRegistry, manager, bot } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				const promise = (
					validatorRegistry.connect(bot) as ValidatorRegistry
				).setPreferredDepositValidatorId(validatorIds[0]);
				await expect(promise)
					.to.emit(
						validatorRegistry,
						"SetPreferredDepositValidatorId"
					)
					.withArgs(validatorIds[0]);
			});
		});
	});

	describe("Set the preferred withdrawal validator id", function () {
		describe("Negative", function () {
			it("Should revert with the right error if paused", async function () {
				const { validatorRegistry, manager, bot } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).togglePause();

				const promise = (
					validatorRegistry.connect(bot) as ValidatorRegistry
				).setPreferredWithdrawalValidatorId(validatorIds[0]);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

			it("Should revert with the right error if called by a non admin", async function () {
				const { validatorRegistry, executor, manager, botRole } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				const promise = (
					validatorRegistry.connect(executor) as ValidatorRegistry
				).setPreferredWithdrawalValidatorId(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${botRole}`
				);
			});

			it("Should revert with the right error if passing the zero validator id", async function () {
				const { validatorRegistry, manager, bot } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[0]);

				const promise = (
					validatorRegistry.connect(bot) as ValidatorRegistry
				).setPreferredWithdrawalValidatorId(0n);
				await expect(promise).to.revertedWith("Zero validator id");
			});

			it("Should revert with the right error if having no existing validator", async function () {
				const { validatorRegistry, bot } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(bot) as ValidatorRegistry
				).setPreferredWithdrawalValidatorId(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					"Validator id doesn't exist in our registry"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the SetPreferredWithdrawalValidatorId event", async function () {
				const { validatorRegistry, manager, bot } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).addValidator(validatorIds[1]);

				const promise = (
					validatorRegistry.connect(bot) as ValidatorRegistry
				).setPreferredWithdrawalValidatorId(validatorIds[1]);
				await expect(promise)
					.to.emit(
						validatorRegistry,
						"SetPreferredWithdrawalValidatorId"
					)
					.withArgs(validatorIds[1]);
			});
		});
	});

	describe("Set the MaticX address", function () {
		const maticXAddress = generateRandomAddress();

		describe("Negative", function () {
			it("Should revert with the right error if called by a non admin", async function () {
				const { validatorRegistry, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(executor) as ValidatorRegistry
				).setMaticX(maticXAddress);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing the zero MaticX address", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).setMaticX(ethers.ZeroAddress);
				await expect(promise).to.revertedWith("Zero MaticX address");
			});
		});

		describe("Positive", function () {
			it("Should emit the SetMaticX event", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).setMaticX(maticXAddress);
				await expect(promise)
					.to.emit(validatorRegistry, "SetMaticX")
					.withArgs(maticXAddress);
			});

			it("Should return the right MaticX address", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const [, , initialMaticXAddress]: [string, string, string] =
					await validatorRegistry.getContracts();
				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).setMaticX(maticXAddress);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).setMaticX(maticXAddress);

				const [, , currentMaticXAddress]: [string, string, string] =
					await validatorRegistry.getContracts();
				expect(currentMaticXAddress).not.to.equal(initialMaticXAddress);
				expect(currentMaticXAddress).to.equal(maticXAddress);
			});
		});
	});

	describe("Set a version", function () {
		describe("Negative", function () {
			it("Should revert with the right error if called by a non admin", async function () {
				const { validatorRegistry, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(executor) as ValidatorRegistry
				).setVersion(version);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing an empty version", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).setVersion("");
				await expect(promise).to.be.revertedWith("Empty version");
			});
		});

		describe("Positive", function () {
			it("Should emit the SetVersion event", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).setVersion(version);
				await expect(promise)
					.to.emit(validatorRegistry, "SetVersion")
					.withArgs(version);
			});
		});
	});

	describe("Toggle a pause", function () {
		describe("Negative", function () {
			it("Should revert with the right error if called by a non admin", async function () {
				const { validatorRegistry, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(executor) as ValidatorRegistry
				).togglePause();
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the Paused event if pausing", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).togglePause();
				await expect(promise)
					.to.emit(validatorRegistry, "Paused")
					.withArgs(manager.address);
			});

			it("Should emit the Unpaused event if pausing", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).togglePause();

				const promise = (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).togglePause();
				await expect(promise)
					.to.emit(validatorRegistry, "Unpaused")
					.withArgs(manager.address);
			});

			it("Should return the right paused status if toggling once", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).togglePause();

				const paused: boolean = await validatorRegistry.paused();
				expect(paused).to.be.true;
			});

			it("Should return the right paused status if toggling twice", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).togglePause();
				await (
					validatorRegistry.connect(manager) as ValidatorRegistry
				).togglePause();

				const paused: boolean = await validatorRegistry.paused();
				expect(paused).to.be.false;
			});
		});
	});
});
