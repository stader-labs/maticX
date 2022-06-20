import { expect } from "chai";
import { Transaction, utils } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
	PartnerStaking,
	MaticX,
	PolygonMock,
	ValidatorRegistry,
	StakeManagerMock,
	FxRootMock,
	FxStateRootTunnel,
	FxStateChildTunnel,
	RateProvider,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";

describe("PartnerStaking", () => {
	let partnerStaking: PartnerStaking;
	let deployer: SignerWithAddress;
	let manager: SignerWithAddress;
	let instant_pool_owner: SignerWithAddress;
	let treasury: SignerWithAddress;
	let users: SignerWithAddress[] = [];
	let maticX: MaticX;
	let polygonMock: PolygonMock;
	let validatorRegistry: ValidatorRegistry;
	let stakeManagerMock: StakeManagerMock;
	let fxRootMock: FxRootMock;
	let fxStateRootTunnel: FxStateRootTunnel;
	let fxStateChildTunnel: FxStateChildTunnel;
	let rateProvider: RateProvider;

	let mintAndApproveMatic: (
		signer: SignerWithAddress,
		amount: BigNumberish
	) => Promise<void>;

	let stakeMatic: (
		signer: SignerWithAddress,
		partnerId: number,
		amount: BigNumber
	) => Promise<void>;

	before(() => {
		mintAndApproveMatic = async (signer, amount) => {
			const signerERC = polygonMock.connect(signer);
			await signerERC.mint(amount);
			await signerERC.approve(partnerStaking.address, amount);
		};

		stakeMatic = async (signer, partnerId, amount) => {
			await mintAndApproveMatic(signer, amount.add(10000));
			await partnerStaking.stake(partnerId, amount, {
				from: signer.address,
			});
		};
	});

	beforeEach(async () => {
		[deployer, ...users] = await ethers.getSigners();
		manager = deployer;
		treasury = users[1];
		instant_pool_owner = deployer;
		polygonMock = (await (
			await ethers.getContractFactory("PolygonMock")
		).deploy()) as PolygonMock;
		await polygonMock.deployed();

		fxRootMock = (await (
			await ethers.getContractFactory("FxRootMock")
		).deploy()) as FxRootMock;
		await fxRootMock.deployed();

		fxStateChildTunnel = (await (
			await ethers.getContractFactory("FxStateChildTunnel")
		).deploy(fxRootMock.address)) as FxStateChildTunnel;
		await fxStateChildTunnel.deployed();

		fxStateRootTunnel = (await (
			await ethers.getContractFactory("FxStateRootTunnel")
		).deploy(
			manager.address,
			fxRootMock.address,
			manager.address
		)) as FxStateRootTunnel;
		await fxStateRootTunnel.deployed();

		rateProvider = (await (
			await ethers.getContractFactory("RateProvider")
		).deploy(fxStateChildTunnel.address)) as RateProvider;
		await rateProvider.deployed();

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
				instant_pool_owner.address,
				treasury.address,
			]
		)) as MaticX;
		await maticX.deployed();

		partnerStaking = (await upgrades.deployProxy(
			await ethers.getContractFactory("PartnerStaking"),
			[
				manager.address, // foundation
				polygonMock.address,
				maticX.address,
				manager.address,
			]
		)) as PartnerStaking;
		await partnerStaking.deployed();

		await validatorRegistry.setMaticX(maticX.address);
		await stakeManagerMock.createValidator(1);
		await validatorRegistry.addValidator(1);
		await validatorRegistry.setPreferredDepositValidatorId(1);
		await validatorRegistry.setPreferredWithdrawalValidatorId(1);
		await stakeManagerMock.createValidator(2);
		await validatorRegistry.addValidator(2);
		await maticX.setFxStateRootTunnel(fxStateRootTunnel.address);
		await fxStateRootTunnel.setMaticX(maticX.address);
		await fxStateRootTunnel.setFxChildTunnel(fxStateChildTunnel.address);
		await fxStateChildTunnel.setFxRootTunnel(fxStateRootTunnel.address);

		const abiCoder = new utils.AbiCoder();
		await fxRootMock.sendMessageToChildWithAddress(
			fxStateChildTunnel.address,
			fxStateRootTunnel.address,
			abiCoder.encode(["uint", "uint"], [1000, 1000])
		);
	});

	it("it registers partner successfully", async () => {
		expect(await partnerStaking.totalPartnerCount()).to.eql(0);
		await partnerStaking.registerPartner(
			users[0].address,
			"Partner1",
			"www.staderlabs.com",
			[]
		);
		expect(await partnerStaking.totalPartnerCount()).to.eql(1);
	});

	it("it stakes funds against a partner successfully", async () => {
		expect(await partnerStaking.totalPartnerCount()).to.eql(0);
		await partnerStaking.registerPartner(
			users[0].address,
			"Partner1",
			"www.staderlabs.com",
			[]
		);
		expect(await partnerStaking.totalPartnerCount()).to.eql(1);
		const oldPartnerDetails = await partnerStaking.getPartnerDetails(1);
		expect(oldPartnerDetails.totalMaticStaked).to.eql(BigNumber.from(0));
		await stakeMatic(manager, 1, BigNumber.from(1000));
		const maticXConversionResult = await maticX.convertMaticToMaticX(
			BigNumber.from(1000)
		);
		const newDetails = await partnerStaking.getPartnerDetails(1);
		expect(newDetails.totalMaticStaked).to.eql(BigNumber.from(1000));
		expect(newDetails.totalMaticX).to.eql(maticXConversionResult[0]);
	});
});
