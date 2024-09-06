import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Transaction } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
	MaticX,
	PolygonMock,
	ValidatorRegistry,
	StakeManagerMock,
} from "../typechain";

describe("ValidatorRegistry contract", function () {
	let deployer: SignerWithAddress;
	let manager: SignerWithAddress;
	let treasury: SignerWithAddress;
	let users: SignerWithAddress[] = [];
	let maticX: MaticX;
	let polygonMock: PolygonMock;
	let validatorRegistry: ValidatorRegistry;
	let stakeManagerMock: StakeManagerMock;

	let addValidator: (
		signer: SignerWithAddress,
		validartorId: BigNumberish
	) => Promise<Transaction>;
	let removeValidator: (
		signer: SignerWithAddress,
		validartorId: BigNumberish
	) => Promise<Transaction>;
	let createValidator: (
		signer: SignerWithAddress,
		validartorId: BigNumberish
	) => Promise<void>;
	let setPreferredDepositValidatorId: (
		signer: SignerWithAddress,
		validartorId: BigNumberish
	) => Promise<Transaction>;
	let setPreferredWithdrawalValidatorId: (
		signer: SignerWithAddress,
		validartorId: BigNumberish
	) => Promise<Transaction>;
	let getValidators: () => Promise<BigNumber[]>;
	let getValidatorContract: (validatorId: BigNumberish) => Promise<string>;

	before(() => {
		addValidator = async (signer, validatorId) => {
			const signerValidatorRegistry = validatorRegistry.connect(signer);
			return signerValidatorRegistry.addValidator(validatorId);
		};

		removeValidator = async (signer, validatorId) => {
			const signerValidatorRegistry = validatorRegistry.connect(signer);
			return signerValidatorRegistry.removeValidator(validatorId);
		};

		setPreferredDepositValidatorId = async (signer, validatorId) => {
			const signerValidatorRegistry = validatorRegistry.connect(signer);
			return signerValidatorRegistry.setPreferredDepositValidatorId(
				validatorId
			);
		};

		setPreferredWithdrawalValidatorId = async (signer, validatorId) => {
			const signerValidatorRegistry = validatorRegistry.connect(signer);
			return signerValidatorRegistry.setPreferredWithdrawalValidatorId(
				validatorId
			);
		};

		createValidator = async (signer, validatorId) => {
			const signerStakeManagerMock = stakeManagerMock.connect(signer);
			await signerStakeManagerMock.createValidator(validatorId);
		};

		getValidators = async () => {
			const validators = validatorRegistry.getValidators();
			return validators;
		};

		getValidatorContract = async (validatorId) => {
			const contractAddress =
				stakeManagerMock.getValidatorContract(validatorId);
			return contractAddress;
		};
	});

	beforeEach(async () => {
		[deployer, ...users] = await ethers.getSigners();
		manager = deployer;
		treasury = deployer;

		polygonMock = (await (
			await ethers.getContractFactory("PolygonMock")
		).deploy()) as PolygonMock;
		await polygonMock.deployed();

		stakeManagerMock = (await (
			await ethers.getContractFactory("StakeManagerMock")
		).deploy(polygonMock.address, polygonMock.address)) as StakeManagerMock;
		await stakeManagerMock.deployed();

		validatorRegistry = (await upgrades.deployProxy(
			await ethers.getContractFactory("ValidatorRegistry"),
			[
				stakeManagerMock.address,
				polygonMock.address,
				ethers.constants.AddressZero,
				manager.address,
			]
		)) as ValidatorRegistry;
		await validatorRegistry.deployed();

		maticX = (await upgrades.deployProxy(
			await ethers.getContractFactory("MaticX"),
			[
				validatorRegistry.address,
				stakeManagerMock.address,
				polygonMock.address,
				manager.address,
				treasury.address,
			]
		)) as MaticX;
		await maticX.deployed();

		await validatorRegistry.setMaticX(maticX.address);

		// add bot role for deployer
		await validatorRegistry.grantRole(
			await validatorRegistry.BOT(),
			manager.address
		);
	});

	it("Should add new validators", async function () {
		const validatorIds = [3, 6];

		for (const id of validatorIds) {
			await createValidator(manager, id);
			const constractAddress = await getValidatorContract(id);
			expect(constractAddress).to.be.properAddress;
		}

		const expectedValidators = [];
		const validators = await getValidators();
		expect(validators).to.be.empty;
		for (const id of validatorIds) {
			await expect(await addValidator(manager, id))
				.emit(validatorRegistry, "AddValidator")
				.withArgs(id);
			expectedValidators.push(BigNumber.from(id));
			const validators = await getValidators();
			expect(validators).to.eql(expectedValidators);
		}
	});

	it("Should not add existing validator", async function () {
		await createValidator(manager, 1);
		await expect(await addValidator(manager, 1))
			.emit(validatorRegistry, "AddValidator")
			.withArgs(1);

		await expect(addValidator(manager, 1)).to.be.revertedWith(
			"Validator id already exists in our registry"
		);
	});

	it("Should remove validators", async function () {
		const validatorIds = [3, 6];
		const expectedValidators = [];
		for (const id of validatorIds) {
			await createValidator(manager, id);
			await expect(await addValidator(manager, id))
				.emit(validatorRegistry, "AddValidator")
				.withArgs(id);
			expectedValidators.push(BigNumber.from(id));
		}

		const validators = await getValidators();
		expect(validators).to.eql(expectedValidators);
		for (const id of validatorIds) {
			await expect(await removeValidator(manager, id))
				.emit(validatorRegistry, "RemoveValidator")
				.withArgs(id);
			expectedValidators.splice(0, 1);
			const validators = await getValidators();
			expect(validators).to.eql(expectedValidators);
		}
	});

	it("Should not remove an validator when it is preferred for deposits", async function () {
		await createValidator(manager, 1);
		await addValidator(manager, 1);
		await expect(await setPreferredDepositValidatorId(manager, 1))
			.emit(validatorRegistry, "SetPreferredDepositValidatorId")
			.withArgs(1);

		await expect(removeValidator(manager, 1)).to.be.revertedWith(
			"Can't remove a preferred validator for deposits"
		);
	});

	it("Should not remove an validator when it is preferred for withdrawals", async function () {
		await createValidator(manager, 1);
		await addValidator(manager, 1);
		await expect(await setPreferredWithdrawalValidatorId(manager, 1))
			.emit(validatorRegistry, "SetPreferredWithdrawalValidatorId")
			.withArgs(1);

		await expect(removeValidator(manager, 1)).to.be.revertedWith(
			"Can't remove a preferred validator for withdrawals"
		);
	});

	it("Should not remove non existing validator", async function () {
		await expect(removeValidator(manager, 1)).to.be.revertedWith(
			"Validator id doesn't exist in our registry"
		);
	});

	it("it should add and then remove a bot address", async () => {
		const botRole = await validatorRegistry.BOT();
		expect(
			await validatorRegistry.hasRole(botRole, users[0].address)
		).to.eql(false);
		const tx = await validatorRegistry.grantRole(botRole, users[0].address);
		await expect(tx)
			.to.emit(validatorRegistry, "RoleGranted")
			.withArgs(botRole, users[0].address, deployer.address);
		expect(
			await validatorRegistry.hasRole(botRole, users[0].address)
		).to.eql(true);

		const tx2 = await validatorRegistry.revokeRole(
			botRole,
			users[0].address
		);
		await expect(tx2)
			.to.emit(validatorRegistry, "RoleRevoked")
			.withArgs(botRole, users[0].address, deployer.address);
		expect(
			await validatorRegistry.hasRole(botRole, users[0].address)
		).to.eql(false);
	});

	it("it should setPreferredDepositValidatorId - accesscontrol check", async () => {
		const validatorId = BigNumber.from(1);
		await createValidator(manager, validatorId);
		await addValidator(manager, validatorId);

		const botRole = await validatorRegistry.BOT();
		await validatorRegistry.grantRole(botRole, users[1].address);

		// fails for non-bot
		await expect(setPreferredDepositValidatorId(users[0], validatorId)).to
			.be.reverted;
		await expect(setPreferredWithdrawalValidatorId(users[0], validatorId))
			.to.be.reverted;

		// succeeds for bot
		await expect(setPreferredDepositValidatorId(users[1], validatorId))
			.emit(validatorRegistry, "SetPreferredDepositValidatorId")
			.withArgs(validatorId);
		await expect(setPreferredWithdrawalValidatorId(users[1], validatorId))
			.emit(validatorRegistry, "SetPreferredWithdrawalValidatorId")
			.withArgs(validatorId);
	});
});
