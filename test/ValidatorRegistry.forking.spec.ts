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
	IMaticX,
	IStakeManager,
	ValidatorRegistry,
} from "../typechain-types";
import { extractEnvironmentVariables } from "../utils/environment";
import { generateRandomAddress } from "../utils/account";

const envVars = extractEnvironmentVariables();

describe("ValidatorRegistry (Forking)", function () {
	const validatorIds = [128, 72];
	const version = "1";

	async function deployFixture(fullValidatorRegistryInitialization = true) {
		await reset(envVars.ROOT_CHAIN_RPC, envVars.FORKING_ROOT_BLOCK_NUMBER);

		// EOA definitions
		const manager = await impersonateAccount(
			"0x80A43dd35382C4919991C5Bca7f46Dd24Fde4C67"
		);
		const [executor, bot] = await ethers.getSigners();

		// Contract definitions
		const stakeManager = (await ethers.getContractAt(
			"IStakeManager",
			"0x5e3Ef299fDDf15eAa0432E6e66473ace8c13D908"
		)) as IStakeManager;

		const maticX = (await ethers.getContractAt(
			"IMaticX",
			"0xf03A7Eb46d01d9EcAA104558C732Cf82f6B6B645"
		)) as IMaticX;

		const matic = (await ethers.getContractAt(
			"IERC20",
			"0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0"
		)) as IERC20;

		const pol = (await ethers.getContractAt(
			"IERC20",
			"0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6"
		)) as IERC20;

		const ValidatorRegistry =
			await ethers.getContractFactory("ValidatorRegistry");
		const validatorRegistry = (await upgrades.deployProxy(
			ValidatorRegistry,
			[
				stakeManager.address,
				matic.address,
				ethers.constants.AddressZero,
				manager.address,
			]
		)) as ValidatorRegistry;

		// Contract initializations
		if (fullValidatorRegistryInitialization) {
			await validatorRegistry.connect(manager).initializeV2(pol.address);
		}

		const defaultAdminRole = await validatorRegistry.DEFAULT_ADMIN_ROLE();
		const botRole = await validatorRegistry.BOT();

		await validatorRegistry.connect(manager).setMaticX(maticX.address);
		await validatorRegistry
			.connect(manager)
			.grantRole(botRole, bot.address);

		return {
			validatorRegistry,
			stakeManager,
			maticX,
			matic,
			pol,
			manager,
			executor,
			bot,
			defaultAdminRole,
			botRole,
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
				const { maticX, matic, manager } =
					await loadFixture(deployFixture);

				const ValidatorRegistry =
					await ethers.getContractFactory("ValidatorRegistry");
				const promise = upgrades.deployProxy(ValidatorRegistry, [
					ethers.constants.AddressZero,
					matic.address,
					maticX.address,
					manager.address,
				]);
				await expect(promise).to.be.revertedWith(
					"Zero stake manager address"
				);
			});

			it("Should revert with the right error if reinitializing", async function () {
				const {
					validatorRegistry,
					stakeManager,
					matic,
					maticX,
					manager,
				} = await loadFixture(deployFixture);

				const promise = validatorRegistry.initialize(
					stakeManager.address,
					matic.address,
					maticX.address,
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
					"Invalid validator index"
				);
			});
		});

		describe("Positive", function () {
			it("Should return the default admin role set for the manager", async function () {
				const { validatorRegistry, manager, defaultAdminRole } =
					await loadFixture(deployFixture);

				const hasRole = await validatorRegistry.hasRole(
					defaultAdminRole,
					manager.address
				);
				expect(hasRole).to.be.true;
			});

			it("Should return the right paused status", async function () {
				const { validatorRegistry } = await loadFixture(deployFixture);

				const paused = await validatorRegistry.paused();
				expect(paused).to.be.false;
			});

			it("Should return the right version", async function () {
				const { validatorRegistry } = await loadFixture(deployFixture);

				const currentVersion = await validatorRegistry.version();
				expect(currentVersion).to.equal("");
			});

			it("Should return the right contract addresses", async function () {
				const { validatorRegistry, stakeManager, maticX, matic, pol } =
					await loadFixture(deployFixture);

				const [
					stakeManagerAddress,
					maticAddress,
					maticXAddress,
					polAddress,
				] = await validatorRegistry.getContracts();
				expect(stakeManagerAddress).to.equal(stakeManager.address);
				expect(maticAddress).to.equal(matic.address);
				expect(maticXAddress).to.equal(maticX.address);
				expect(polAddress).to.equal(pol.address);
			});

			it("Should return the right validator ids", async function () {
				const { validatorRegistry } = await loadFixture(deployFixture);

				const currentValidatorIds =
					await validatorRegistry.getValidators();
				expect(currentValidatorIds).to.be.empty;
			});
		});
	});

	describe("Upgrade the contract", function () {
		describe("Checks", function () {
			it("Should return a new address of the implementation if extended", async function () {
				const { validatorRegistry } = await loadFixture(deployFixture);

				const initialImplementationAddress =
					await upgrades.erc1967.getImplementationAddress(
						validatorRegistry.address
					);

				const ExtendedValidatorRegistryMock =
					await ethers.getContractFactory(
						"ExtendedValidatorRegistryMock"
					);
				await upgrades.upgradeProxy(
					validatorRegistry,
					ExtendedValidatorRegistryMock
				);

				const currentImplementationAddress =
					await upgrades.erc1967.getImplementationAddress(
						validatorRegistry.address
					);
				expect(initialImplementationAddress).not.to.equal(
					currentImplementationAddress
				);
			});

			it("Should return the same address of the implementation if not extended", async function () {
				const { validatorRegistry } = await loadFixture(deployFixture);

				const initialImplementationAddress =
					await upgrades.erc1967.getImplementationAddress(
						validatorRegistry.address
					);

				const ValidatorRegistry =
					await ethers.getContractFactory("ValidatorRegistry");
				await upgrades.upgradeProxy(
					validatorRegistry,
					ValidatorRegistry
				);

				const currentImplementationAddress =
					await upgrades.erc1967.getImplementationAddress(
						validatorRegistry.address
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
				const { validatorRegistry, executor } =
					await loadFixture(deployFixture);

				const iface = new ethers.utils.Interface([
					"function foobar(uint256)",
				]);
				const promise = executor.sendTransaction({
					to: validatorRegistry.address,
					data: iface.encodeFunctionData("foobar", [1]),
				});
				await expect(promise).to.be.reverted;
			});

			it("Should revert if sending arbitrary data", async function () {
				const { validatorRegistry, executor } =
					await loadFixture(deployFixture);

				const promise = executor.sendTransaction({
					to: validatorRegistry.address,
					data: "0x01",
				});
				await expect(promise).to.be.reverted;
			});

			it("Should revert if sending no data", async function () {
				const { validatorRegistry, executor } =
					await loadFixture(deployFixture);

				const promise = executor.sendTransaction({
					to: validatorRegistry.address,
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

				const promise = validatorRegistry
					.connect(executor)
					.grantRole(defaultAdminRole, executor.address);
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

				const promise = validatorRegistry
					.connect(manager)
					.grantRole(defaultAdminRole, executor.address);
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

				await validatorRegistry
					.connect(manager)
					.grantRole(defaultAdminRole, executor.address);

				const hasRole = await validatorRegistry.hasRole(
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

				const promise = validatorRegistry
					.connect(executor)
					.revokeRole(defaultAdminRole, executor.address);
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

				await validatorRegistry
					.connect(manager)
					.grantRole(defaultAdminRole, executor.address);

				const promise = validatorRegistry
					.connect(manager)
					.revokeRole(defaultAdminRole, executor.address);
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

				await validatorRegistry
					.connect(manager)
					.grantRole(defaultAdminRole, executor.address);

				await validatorRegistry
					.connect(manager)
					.revokeRole(defaultAdminRole, executor.address);

				const hasRole = await validatorRegistry.hasRole(
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

				const promise = validatorRegistry
					.connect(manager)
					.renounceRole(defaultAdminRole, executor.address);
				await expect(promise).to.be.revertedWith(
					"AccessControl: can only renounce roles for self"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the RoleRevoked event", async function () {
				const { validatorRegistry, manager, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = validatorRegistry
					.connect(manager)
					.renounceRole(defaultAdminRole, manager.address);
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

				await validatorRegistry
					.connect(manager)
					.renounceRole(defaultAdminRole, manager.address);

				const hasRole = await validatorRegistry.hasRole(
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
				const { validatorRegistry, pol, manager } = await loadFixture(
					deployFixture.bind(null, false)
				);

				await validatorRegistry
					.connect(manager)
					.initializeV2(pol.address);

				const promise = validatorRegistry
					.connect(manager)
					.initializeV2(pol.address);
				await expect(promise).to.be.revertedWith(
					"Initializable: contract is already initialized"
				);
			});

			it("Should revert with the right error if called by a non admin", async function () {
				const { validatorRegistry, pol, executor, defaultAdminRole } =
					await loadFixture(deployFixture.bind(null, false));

				const promise = validatorRegistry
					.connect(executor)
					.initializeV2(pol.address);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing the zero pol token address", async function () {
				const { validatorRegistry, manager } = await loadFixture(
					deployFixture.bind(null, false)
				);

				const promise = validatorRegistry
					.connect(manager)
					.initializeV2(ethers.constants.AddressZero);
				await expect(promise).to.be.revertedWith(
					"Zero POL token address"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the Initialized event", async function () {
				const { validatorRegistry, pol, manager } = await loadFixture(
					deployFixture.bind(null, false)
				);

				const promise = validatorRegistry
					.connect(manager)
					.initializeV2(pol.address);
				await expect(promise)
					.to.emit(validatorRegistry, "Initialized")
					.withArgs(2);
			});

			it("Should return the right contract addresses", async function () {
				const {
					validatorRegistry,
					stakeManager,
					matic,
					maticX,
					pol,
					manager,
				} = await loadFixture(deployFixture.bind(null, false));

				await validatorRegistry
					.connect(manager)
					.initializeV2(pol.address);

				const [
					stakeManagerAddress,
					maticAddress,
					maticXAddress,
					polAddress,
				] = await validatorRegistry.getContracts();
				expect(stakeManagerAddress).to.equal(stakeManager.address);
				expect(maticAddress).to.equal(matic.address);
				expect(maticXAddress).to.equal(maticX.address);
				expect(polAddress).to.equal(pol.address);
			});
		});
	});

	describe("Add a validator", function () {
		describe("Negative", function () {
			it("Should revert with the right error if paused", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await validatorRegistry.connect(manager).togglePause();

				const promise = validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

			it("Should revert with the right error if called by a non admin", async function () {
				const { validatorRegistry, executor, defaultAdminRole } =
					await loadFixture(deployFixture);

				const promise = validatorRegistry
					.connect(executor)
					.addValidator(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing the zero validator id", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = validatorRegistry
					.connect(manager)
					.addValidator(0);
				await expect(promise).to.revertedWith("Zero validator id");
			});

			it("Should revert with the right error if having an already existing validator", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);

				const promise = validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					"Validator id already exists in our registry"
				);
			});

			it("Should revert with the right error if having no validator share", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = validatorRegistry
					.connect(manager)
					.addValidator(10_000);
				await expect(promise).to.be.revertedWith(
					"Validator has no validator share"
				);
			});

			it("Should revert with the right error if having no active validator", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = validatorRegistry
					.connect(manager)
					.addValidator(1);
				await expect(promise).to.be.revertedWith(
					"Validator isn't active"
				);
			});

			it("Should revert with the right error if passing an invalid validator index", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);

				const promise = validatorRegistry.getValidatorId(1);
				await expect(promise).to.be.revertedWith(
					"Invalid validator index"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the AddValidator event", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);
				await expect(promise)
					.to.emit(validatorRegistry, "AddValidator")
					.withArgs(validatorIds[0]);
			});

			it("Should return the right validators", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				for (const validatorId of validatorIds) {
					await validatorRegistry
						.connect(manager)
						.addValidator(validatorId);
				}

				const currentValidatorIds =
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

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);

				const currentValidatorId =
					await validatorRegistry.getValidatorId(0);
				expect(currentValidatorId).to.equal(validatorIds[0]);
			});

			it("Should return the right validators existence", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				for (const validatorId of validatorIds) {
					await validatorRegistry
						.connect(manager)
						.addValidator(validatorId);
				}

				for (const validatorId of validatorIds) {
					const currentValidatorIdExists =
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

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);

				await validatorRegistry.connect(manager).togglePause();

				const promise = validatorRegistry
					.connect(manager)
					.removeValidator(validatorIds[0]);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

			it("Should revert with the right error if called by a non admin", async function () {
				const {
					validatorRegistry,
					executor,
					manager,
					defaultAdminRole,
				} = await loadFixture(deployFixture);

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);

				const promise = validatorRegistry
					.connect(executor)
					.removeValidator(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing the zero validator id", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);

				const promise = validatorRegistry
					.connect(manager)
					.removeValidator(0);
				await expect(promise).to.revertedWith("Zero validator id");
			});

			it("Should revert with the right error if having no existing validator", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = validatorRegistry
					.connect(manager)
					.removeValidator(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					"Validator id doesn't exist in our registry"
				);
			});

			it("Should revert with the right error if having the deposit validator set as preferred", async function () {
				const { validatorRegistry, manager, bot } =
					await loadFixture(deployFixture);

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);

				await validatorRegistry
					.connect(bot)
					.setPreferredDepositValidatorId(validatorIds[0]);

				const promise = validatorRegistry
					.connect(manager)
					.removeValidator(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					"Can't remove a preferred validator for deposits"
				);
			});

			it("Should revert with the right error if having the withdrawal validator set as preferred", async function () {
				const { validatorRegistry, manager, bot } =
					await loadFixture(deployFixture);

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);

				await validatorRegistry
					.connect(bot)
					.setPreferredWithdrawalValidatorId(validatorIds[0]);

				const promise = validatorRegistry
					.connect(manager)
					.removeValidator(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					"Can't remove a preferred validator for withdrawals"
				);
			});

			it("Should revert with the right error if having some validator shares", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);

				const promise = validatorRegistry
					.connect(manager)
					.removeValidator(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					"Validator has some shares left"
				);
			});
		});

		describe("Positive", function () {
			// TODO
		});
	});

	describe("Set the preferred deposit validator id", function () {
		describe("Negative", function () {
			it("Should revert with the right error if paused", async function () {
				const { validatorRegistry, manager, bot } =
					await loadFixture(deployFixture);

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);

				await validatorRegistry.connect(manager).togglePause();

				const promise = validatorRegistry
					.connect(bot)
					.setPreferredDepositValidatorId(validatorIds[0]);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

			it("Should revert with the right error if called by a non admin", async function () {
				const { validatorRegistry, executor, manager, botRole } =
					await loadFixture(deployFixture);

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);

				const promise = validatorRegistry
					.connect(executor)
					.setPreferredDepositValidatorId(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${botRole}`
				);
			});

			it("Should revert with the right error if passing the zero validator id", async function () {
				const { validatorRegistry, manager, bot } =
					await loadFixture(deployFixture);

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);

				const promise = validatorRegistry
					.connect(bot)
					.setPreferredDepositValidatorId(0);
				await expect(promise).to.revertedWith("Zero validator id");
			});

			it("Should revert with the right error if having no existing validator", async function () {
				const { validatorRegistry, bot } =
					await loadFixture(deployFixture);

				const promise = validatorRegistry
					.connect(bot)
					.setPreferredDepositValidatorId(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					"Validator id doesn't exist in our registry"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the SetPreferredDepositValidatorId event", async function () {
				const { validatorRegistry, manager, bot } =
					await loadFixture(deployFixture);

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);

				const promise = validatorRegistry
					.connect(bot)
					.setPreferredDepositValidatorId(validatorIds[0]);
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

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);

				await validatorRegistry.connect(manager).togglePause();

				const promise = validatorRegistry
					.connect(bot)
					.setPreferredWithdrawalValidatorId(validatorIds[0]);
				await expect(promise).to.be.revertedWith("Pausable: paused");
			});

			it("Should revert with the right error if called by a non admin", async function () {
				const { validatorRegistry, executor, manager, botRole } =
					await loadFixture(deployFixture);

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);

				const promise = validatorRegistry
					.connect(executor)
					.setPreferredWithdrawalValidatorId(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${botRole}`
				);
			});

			it("Should revert with the right error if passing the zero validator id", async function () {
				const { validatorRegistry, manager, bot } =
					await loadFixture(deployFixture);

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[0]);

				const promise = validatorRegistry
					.connect(bot)
					.setPreferredWithdrawalValidatorId(0);
				await expect(promise).to.revertedWith("Zero validator id");
			});

			it("Should revert with the right error if having no existing validator", async function () {
				const { validatorRegistry, bot } =
					await loadFixture(deployFixture);

				const promise = validatorRegistry
					.connect(bot)
					.setPreferredWithdrawalValidatorId(validatorIds[0]);
				await expect(promise).to.be.revertedWith(
					"Validator id doesn't exist in our registry"
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the SetPreferredWithdrawalValidatorId event", async function () {
				const { validatorRegistry, manager, bot } =
					await loadFixture(deployFixture);

				await validatorRegistry
					.connect(manager)
					.addValidator(validatorIds[1]);

				const promise = validatorRegistry
					.connect(bot)
					.setPreferredWithdrawalValidatorId(validatorIds[1]);
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

				const promise = validatorRegistry
					.connect(executor)
					.setMaticX(maticXAddress);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing the zero MaticX address", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = validatorRegistry
					.connect(manager)
					.setMaticX(ethers.constants.AddressZero);
				await expect(promise).to.revertedWith("Zero MaticX address");
			});
		});

		describe("Positive", function () {
			it("Should emit the SetMaticX event", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = validatorRegistry
					.connect(manager)
					.setMaticX(maticXAddress);
				await expect(promise)
					.to.emit(validatorRegistry, "SetMaticX")
					.withArgs(maticXAddress);
			});

			it("Should return the right MaticX address", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const [, , initialMaticXAddress] =
					await validatorRegistry.getContracts();
				await validatorRegistry
					.connect(manager)
					.setMaticX(maticXAddress);

				await validatorRegistry
					.connect(manager)
					.setMaticX(maticXAddress);

				const [, , currentMaticXAddress] =
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

				const promise = validatorRegistry
					.connect(executor)
					.setVersion(version);
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});

			it("Should revert with the right error if passing an empty version", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = validatorRegistry
					.connect(manager)
					.setVersion("");
				await expect(promise).to.be.revertedWith("Empty version");
			});
		});

		describe("Positive", function () {
			it("Should emit the SetVersion event", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = validatorRegistry
					.connect(manager)
					.setVersion(version);
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

				const promise = validatorRegistry
					.connect(executor)
					.togglePause();
				await expect(promise).to.be.revertedWith(
					`AccessControl: account ${executor.address.toLowerCase()} is missing role ${defaultAdminRole}`
				);
			});
		});

		describe("Positive", function () {
			it("Should emit the Paused event if pausing", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				const promise = validatorRegistry
					.connect(manager)
					.togglePause();
				await expect(promise)
					.to.emit(validatorRegistry, "Paused")
					.withArgs(manager.address);
			});

			it("Should emit the Unpaused event if pausing", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await validatorRegistry.connect(manager).togglePause();

				const promise = validatorRegistry
					.connect(manager)
					.togglePause();
				await expect(promise)
					.to.emit(validatorRegistry, "Unpaused")
					.withArgs(manager.address);
			});

			it("Should return the right paused status if toggling once", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await validatorRegistry.connect(manager).togglePause();

				const paused = await validatorRegistry.paused();
				expect(paused).to.be.true;
			});

			it("Should return the right paused status if toggling twice", async function () {
				const { validatorRegistry, manager } =
					await loadFixture(deployFixture);

				await validatorRegistry.connect(manager).togglePause();
				await validatorRegistry.connect(manager).togglePause();

				const paused = await validatorRegistry.paused();
				expect(paused).to.be.false;
			});
		});
	});
});
