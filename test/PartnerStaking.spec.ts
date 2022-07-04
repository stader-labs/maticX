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
import exp from "constants";

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
	const weiUnit = BigNumber.from(10).pow(18);

	let delay: (time: number) => Promise<void>;
	let mintAndApproveMatic: (
		signer: SignerWithAddress,
		amount: BigNumberish
	) => Promise<void>;

	let stakeRewardsAndDistributeFees: (
		signer: SignerWithAddress,
		validatorId: BigNumberish
	) => Promise<Transaction>;

	let registerPartner: (_partnerId: number) => Promise<any>;
	let stakeMatic: (
		_partnerId: number,
		amount: BigNumber
	) => Promise<Transaction>;

	let changeMaticXRate: () => Promise<void>;
	let provideFeeReimbursalMatic: (amount: BigNumber) => Promise<Transaction>;

	before(() => {
		delay = (time: number) => new Promise((res) => setTimeout(res, time));

		mintAndApproveMatic = async (signer, amount) => {
			const signerERC = polygonMock.connect(signer);
			await signerERC.mint(amount);
			await signerERC.approve(partnerStaking.address, amount);
		};

		stakeRewardsAndDistributeFees = async (signer, validatorId) => {
			const signerMaticX = maticX.connect(signer);
			return signerMaticX.stakeRewardsAndDistributeFees(validatorId);
		};

		registerPartner = async (_partnerId: number) => {
			return await partnerStaking.registerPartner(
				users[_partnerId - 1].address,
				`Partner${_partnerId}`,
				`www.staderlabs${_partnerId}.com`,
				[],
				BigNumber.from(1),
				10,
				BigNumber.from(0)
			);
		};

		stakeMatic = async (_partnerId: number, amount: BigNumber) => {
			await mintAndApproveMatic(manager, amount);
			return await partnerStaking.stake(_partnerId, amount, {
				from: manager.address,
			});
		};

		changeMaticXRate = async () => {
			stakeRewardsAndDistributeFees(manager, BigNumber.from(1));
			stakeRewardsAndDistributeFees(manager, BigNumber.from(2));
			await polygonMock.mintTo(
				maticX.address,
				BigNumber.from(100).mul(weiUnit)
			);
		};

		provideFeeReimbursalMatic = async (amount: BigNumber) => {
			await mintAndApproveMatic(manager, amount);
			return await partnerStaking.provideFeeReimbursalMatic(amount, {
				from: manager.address,
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

	it("it changes fee reimbursal percent", async () => {
		expect(await partnerStaking.feeReimbursalPercent()).to.eql(5);
		const tx = await partnerStaking.setFeeReimbursalPercent(2);
		expect(await partnerStaking.feeReimbursalPercent()).to.eql(2);
		await expect(tx)
			.emit(partnerStaking, "SetFeeReimbursalPercent")
			.withArgs(2, (await ethers.provider.getBlock("latest")).timestamp);
	});

	it("it adds foundationApprovedAddress", async () => {
		expect(
			await partnerStaking.isFoundationApprovedAddress(manager.address)
		).to.eql(true);
		expect(
			await partnerStaking.isFoundationApprovedAddress(users[0].address)
		).to.eql(false);
		const tx = await partnerStaking.addFoundationApprovedAddress(
			users[0].address
		);
		expect(
			await partnerStaking.isFoundationApprovedAddress(users[0].address)
		).to.eql(true);
		await expect(tx)
			.emit(partnerStaking, "AddFoundationApprovedAddress")
			.withArgs(
				users[0].address,
				(
					await ethers.provider.getBlock("latest")
				).timestamp
			);
	});

	it("it removes foundationApprovedAddress", async () => {
		expect(
			await partnerStaking.isFoundationApprovedAddress(manager.address)
		).to.eql(true);
		await partnerStaking.addFoundationApprovedAddress(users[0].address);
		expect(
			await partnerStaking.isFoundationApprovedAddress(users[0].address)
		).to.eql(true);
		const tx = await partnerStaking.removeFoundationApprovedAddress(
			users[0].address
		);
		expect(
			await partnerStaking.isFoundationApprovedAddress(users[0].address)
		).to.eql(false);
		await expect(tx)
			.emit(partnerStaking, "RemoveFoundationApprovedAddress")
			.withArgs(
				users[0].address,
				(
					await ethers.provider.getBlock("latest")
				).timestamp
			);
	});

	it("it sets disbursal bot address", async () => {
		expect(
			await partnerStaking.isDisbursalBotAddress(manager.address)
		).to.eql(true);
		expect(
			await partnerStaking.isDisbursalBotAddress(users[0].address)
		).to.eql(false);
		const tx = await partnerStaking.setDisbursalBotAddress(
			users[0].address
		);
		expect(
			await partnerStaking.isDisbursalBotAddress(manager.address)
		).to.eql(false);
		expect(
			await partnerStaking.isDisbursalBotAddress(users[0].address)
		).to.eql(true);
		await expect(tx)
			.emit(partnerStaking, "SetDisbursalBotAddress")
			.withArgs(
				users[0].address,
				(
					await ethers.provider.getBlock("latest")
				).timestamp
			);
	});

	it("it adds funds to fee reimbursal pool", async () => {
		expect(await partnerStaking.feeReimbursalPool()).to.eql(
			BigNumber.from(0)
		);
		const amount = BigNumber.from(100);
		const tx = await provideFeeReimbursalMatic(amount);
		expect(await partnerStaking.feeReimbursalPool()).to.eql(amount);
		await expect(tx)
			.emit(partnerStaking, "ProvideFeeReimbursalMatic")
			.withArgs(
				amount,
				(
					await ethers.provider.getBlock("latest")
				).timestamp
			);
	});

	it("it registers partner successfully", async () => {
		expect(await partnerStaking.currentPartnerId()).to.eql(0);
		const tx = await registerPartner(1);
		expect(await partnerStaking.currentPartnerId()).to.eql(1);
		const latestBlock = await ethers.provider.getBlock("latest");
		// event fired
		await expect(tx)
			.emit(partnerStaking, "RegisterPartner")
			.withArgs(1, users[0].address, latestBlock.timestamp);
	});

	it("it changes partner status", async () => {
		await registerPartner(1);
		expect((await partnerStaking.partners(1)).status).to.eql(0);
		const tx = await partnerStaking.changePartnerStatus(1, false);
		expect((await partnerStaking.partners(1)).status).to.eql(1);
		await expect(tx)
			.emit(partnerStaking, "ChangePartnerStatus")
			.withArgs(
				1,
				users[0].address,
				false,
				(
					await ethers.provider.getBlock("latest")
				).timestamp
			);
	});

	it("it changes partner address", async () => {
		await registerPartner(1);
		expect((await partnerStaking.partners(1)).walletAddress).to.eql(
			users[0].address
		);
		expect(
			await partnerStaking.partnerAddressToId(users[0].address)
		).to.eql(1);
		const tx = await partnerStaking.changePartnerWalletAddress(
			1,
			users[1].address
		);
		expect((await partnerStaking.partners(1)).walletAddress).to.eql(
			users[1].address
		);
		expect(
			await partnerStaking.partnerAddressToId(users[1].address)
		).to.eql(1);
		expect(
			await partnerStaking.partnerAddressToId(users[0].address)
		).to.eql(0);
		await expect(tx)
			.emit(partnerStaking, "ChangePartnerWalletAddress")
			.withArgs(
				1,
				users[0].address,
				users[1].address,
				(
					await ethers.provider.getBlock("latest")
				).timestamp
			);
	});

	it("it changes partner disbursal count", async () => {
		await registerPartner(1);
		expect((await partnerStaking.partners(1)).disbursalCount).to.eql(10);
		const tx = await partnerStaking.changePartnerDisbursalCount(1, 11);
		expect((await partnerStaking.partners(1)).disbursalCount).to.eql(11);
		await expect(tx)
			.emit(partnerStaking, "ChangePartnerDisbursalCount")
			.withArgs(
				1,
				11,
				(
					await ethers.provider.getBlock("latest")
				).timestamp
			);
	});

	it("it stakes funds against a partner successfully", async () => {
		await registerPartner(1);
		expect((await partnerStaking.partners(1)).totalMaticStaked).to.eql(
			BigNumber.from(0)
		);
		const maticAmount = BigNumber.from(1000);
		const tx = await stakeMatic(1, maticAmount);
		const maticXConversionResult = await maticX.convertMaticToMaticX(
			BigNumber.from(1000)
		);
		const newDetails = await partnerStaking.partners(1);
		expect(newDetails.totalMaticStaked).to.eql(BigNumber.from(1000));
		expect(newDetails.totalMaticX).to.eql(maticXConversionResult[0]);
		const latestBlock = await ethers.provider.getBlock("latest");
		await expect(tx)
			.emit(partnerStaking, "FoundationStake")
			.withArgs(
				1,
				users[0].address,
				maticAmount,
				maticXConversionResult[0],
				latestBlock.timestamp
			);
	});

	it("it stakes funds against a partner successfully - fails due to inactive partner", async () => {
		await registerPartner(1);
		await partnerStaking.changePartnerStatus(1, false);
		const maticAmount = BigNumber.from(1000);
		const tx = stakeMatic(1, maticAmount);
		await expect(tx).to.be.revertedWith("Inactive Partner");
	});

	it("it calculates due rewards for a partner and adds them to batch", async () => {
		await registerPartner(1);
		await registerPartner(2);
		const partner1Matic = BigNumber.from(101);
		const partner2Matic = BigNumber.from(200);
		await stakeMatic(1, partner1Matic.mul(weiUnit));
		await stakeMatic(2, partner2Matic.mul(weiUnit));
		const oldPartner1 = await partnerStaking.partners(1);
		const oldPartner2 = await partnerStaking.partners(2);

		/**  Unstake Rewards **/
		// console.log(await maticX.convertMaticXToMatic(weiUnit));
		await changeMaticXRate();
		// console.log(await maticX.convertMaticXToMatic(weiUnit));
		const maticXRate = (await maticX.convertMaticToMaticX(weiUnit))[0];
		const tx = await partnerStaking.addDueRewardsToCurrentBatch([1, 2], {
			from: manager.address,
		});
		const newPartner1 = await partnerStaking.partners(1);
		const newPartner2 = await partnerStaking.partners(2);
		// partner1 current maticX to equal matic Staked
		expect(newPartner1.totalMaticX).to.eql(
			newPartner1.totalMaticStaked.mul(maticXRate).div(weiUnit)
		);
		expect(newPartner1.disbursalRemaining).to.eql(
			newPartner1.disbursalCount - 1
		);
		// partner2 current maticX to equal matic Staked
		expect(newPartner2.totalMaticX).to.eql(
			newPartner2.totalMaticStaked.mul(maticXRate).div(weiUnit)
		);
		expect(newPartner2.disbursalRemaining).to.eql(
			newPartner2.disbursalCount - 1
		);
		const latestBlock = await ethers.provider.getBlock("latest");
		await expect(tx)
			.emit(partnerStaking, "UnstakePartnerReward")
			.withArgs(
				1,
				users[0].address,
				1,
				oldPartner1.totalMaticX.sub(newPartner1.totalMaticX),
				latestBlock.timestamp
			);
		await expect(tx)
			.emit(partnerStaking, "UnstakePartnerReward")
			.withArgs(
				2,
				users[1].address,
				1,
				oldPartner2.totalMaticX.sub(newPartner2.totalMaticX),
				latestBlock.timestamp
			);
		const batch = await partnerStaking.batches(1);
		expect(batch.undelegatedAt).to.eql(BigNumber.from(0));
		expect(batch.claimedAt).to.eql(BigNumber.from(0));
		expect(batch.withdrawalEpoch).to.eql(BigNumber.from(0));
		expect(batch.maticXBurned).to.eql(
			oldPartner1.totalMaticX
				.sub(newPartner1.totalMaticX)
				.add(oldPartner2.totalMaticX.sub(newPartner2.totalMaticX))
		);
		expect(batch.maticReceived).to.eql(BigNumber.from(0));
		expect(batch.status).to.eql(0);

		const parnterShare1 = await partnerStaking.getPartnerShare(1, 1);
		const parnterShare2 = await partnerStaking.getPartnerShare(1, 2);
		expect(parnterShare1.maticXUnstaked).to.eql(
			oldPartner1.totalMaticX.sub(newPartner1.totalMaticX)
		);
		expect(parnterShare1.disbursedAt).to.eql(BigNumber.from(0));
		expect(parnterShare2.maticXUnstaked).to.eql(
			oldPartner2.totalMaticX.sub(newPartner2.totalMaticX)
		);
		expect(parnterShare2.disbursedAt).to.eql(BigNumber.from(0));
	});

	it("it calculates due rewards for a partner and adds them to batch - 0 rewards", async () => {
		await registerPartner(1);
		const partner1Matic = BigNumber.from(200);
		await stakeMatic(1, partner1Matic.mul(weiUnit));
		const oldPartner1 = await partnerStaking.partners(1);

		/**  Unstake Rewards **/
		const tx = await partnerStaking.addDueRewardsToCurrentBatch([1], {
			from: manager.address,
		});
		const newPartner1 = await partnerStaking.partners(1);
		// partner1 current maticX to equal matic Staked
		expect(newPartner1.totalMaticX).to.eql(oldPartner1.totalMaticX);
		expect(newPartner1.disbursalRemaining).to.eql(
			newPartner1.disbursalCount
		);
		const latestBlock = await ethers.provider.getBlock("latest");
		await expect(tx)
			.not.emit(partnerStaking, "UnstakePartnerReward")
			.withArgs(
				1,
				users[0].address,
				1,
				oldPartner1.totalMaticX.sub(newPartner1.totalMaticX),
				latestBlock.timestamp
			);
		const batch = await partnerStaking.batches(1);
		expect(batch.undelegatedAt).to.eql(BigNumber.from(0));
		expect(batch.claimedAt).to.eql(BigNumber.from(0));
		expect(batch.withdrawalEpoch).to.eql(BigNumber.from(0));
		expect(batch.maticXBurned).to.eql(BigNumber.from(0));
		expect(batch.maticReceived).to.eql(BigNumber.from(0));
		expect(batch.status).to.eql(0);

		const parnterShare1 = await partnerStaking.getPartnerShare(1, 1);
		expect(parnterShare1.maticXUnstaked).to.eql(BigNumber.from(0));
		expect(parnterShare1.disbursedAt).to.eql(BigNumber.from(0));
	});

	it("it calculates due rewards for a partner and adds them to batch - wrong partnerId", async () => {
		await registerPartner(1);
		await registerPartner(2);
		const partner1Matic = BigNumber.from(101);
		const partner2Matic = BigNumber.from(200);
		await stakeMatic(1, partner1Matic.mul(weiUnit));
		await stakeMatic(2, partner2Matic.mul(weiUnit));
		const oldPartner1 = await partnerStaking.partners(1);
		const oldPartner2 = await partnerStaking.partners(2);

		/**  Unstake Rewards **/
		// console.log(await maticX.convertMaticXToMatic(weiUnit));
		await changeMaticXRate();
		// console.log(await maticX.convertMaticXToMatic(weiUnit));
		const maticXRate = (await maticX.convertMaticToMaticX(weiUnit))[0];
		const tx = partnerStaking.addDueRewardsToCurrentBatch([1, 3], {
			from: manager.address,
		});
		await expect(tx).to.be.revertedWith("Invalid PartnerId");
		const newPartner1 = await partnerStaking.partners(1);
		// partner1 current maticX to equal matic Staked
		expect(newPartner1.totalMaticX).to.eql(oldPartner1.totalMaticX);
		expect(newPartner1.disbursalRemaining).to.eql(
			newPartner1.disbursalCount
		);
		const batch = await partnerStaking.batches(1);
		expect(batch.undelegatedAt).to.eql(BigNumber.from(0));
		expect(batch.claimedAt).to.eql(BigNumber.from(0));
		expect(batch.withdrawalEpoch).to.eql(BigNumber.from(0));
		expect(batch.maticXBurned).to.eql(BigNumber.from(0));
		expect(batch.maticReceived).to.eql(BigNumber.from(0));
		expect(batch.status).to.eql(0);

		const parnterShare1 = await partnerStaking.getPartnerShare(1, 1);
		expect(parnterShare1.maticXUnstaked).to.eql(BigNumber.from(0));
		expect(parnterShare1.disbursedAt).to.eql(BigNumber.from(0));
	});

	it("it calculates due rewards for a partner and adds them to batch - inactive partner", async () => {
		// partner1
		await registerPartner(1);
		// partner2
		await registerPartner(2);

		const partner1Matic = BigNumber.from(101);
		const partner2Matic = BigNumber.from(200);
		await stakeMatic(1, partner1Matic);
		await stakeMatic(2, partner2Matic);
		const oldPartner1 = await partnerStaking.partners(1);

		// mark the second partner inactive
		const tx1 = await partnerStaking.changePartnerStatus(2, false);
		expect((await partnerStaking.partners(2)).status).to.eql(1);
		await expect(tx1)
			.emit(partnerStaking, "ChangePartnerStatus")
			.withArgs(
				2,
				users[1].address,
				false,
				(
					await ethers.provider.getBlock("latest")
				).timestamp
			);

		await changeMaticXRate();
		await expect(
			partnerStaking.addDueRewardsToCurrentBatch([1, 2], {
				from: manager.address,
			})
		).to.be.revertedWith("Inactive Partner");

		expect(await partnerStaking.partners(1)).to.eql(oldPartner1);
	});

	it("it undelegates a batch", async () => {
		await registerPartner(1);
		await registerPartner(2);
		const partner1Matic = BigNumber.from(101);
		const partner2Matic = BigNumber.from(200);
		await stakeMatic(1, partner1Matic.mul(weiUnit));
		await stakeMatic(2, partner2Matic.mul(weiUnit));
		await changeMaticXRate();
		await partnerStaking.addDueRewardsToCurrentBatch([1, 2], {
			from: manager.address,
		});

		const tx = await partnerStaking.unDelegateCurrentBatch({
			from: manager.address,
		});
		const batch = await partnerStaking.batches(1);
		expect(batch.status).to.eql(1);
		await expect(tx)
			.emit(partnerStaking, "UndelegateBatch")
			.withArgs(
				1,
				batch.maticXBurned,
				(
					await ethers.provider.getBlock("latest")
				).timestamp
			);
	});

	it("it claims an undelegated batch", async () => {
		await registerPartner(1);
		await registerPartner(2);
		const partner1Matic = BigNumber.from(101);
		const partner2Matic = BigNumber.from(200);
		await stakeMatic(1, partner1Matic.mul(weiUnit));
		await stakeMatic(2, partner2Matic.mul(weiUnit));
		await changeMaticXRate();
		await partnerStaking.addDueRewardsToCurrentBatch([1, 2], {
			from: manager.address,
		});
		await partnerStaking.unDelegateCurrentBatch({
			from: manager.address,
		});
		const batchBeforeClaim = await partnerStaking.batches(1);

		await stakeManagerMock.setEpoch(batchBeforeClaim.withdrawalEpoch);
		const tx = await partnerStaking.claimUnstakeRewards(0);
		const blockTimestamp = (await ethers.provider.getBlock("latest"))
			.timestamp;
		const expectedMaticReceived = (
			await maticX.convertMaticXToMatic(batchBeforeClaim.maticXBurned)
		)[0];
		await expect(tx)
			.emit(partnerStaking, "ClaimBatch")
			.withArgs(1, expectedMaticReceived, blockTimestamp);
		const batchAfterClaim = await partnerStaking.batches(1);
		expect(batchAfterClaim.claimedAt).to.eql(
			BigNumber.from(blockTimestamp)
		);
		expect(batchAfterClaim.maticReceived).to.eql(expectedMaticReceived);
		expect(batchAfterClaim.status).to.eql(2); // claimed
	});

	it("it claims an undelegated batch - fails because of undelegation period", async () => {
		await registerPartner(1);
		await registerPartner(2);
		const partner1Matic = BigNumber.from(101);
		const partner2Matic = BigNumber.from(200);
		await stakeMatic(1, partner1Matic.mul(weiUnit));
		await stakeMatic(2, partner2Matic.mul(weiUnit));
		await changeMaticXRate();
		await partnerStaking.addDueRewardsToCurrentBatch([1, 2], {
			from: manager.address,
		});
		await partnerStaking.unDelegateCurrentBatch({
			from: manager.address,
		});
		const batchBeforeClaim = await partnerStaking.batches(1);
		const tx = partnerStaking.claimUnstakeRewards(0);
		await expect(tx).to.be.revertedWith("Not able to claim yet");
		const batchAfterClaim = await partnerStaking.batches(1);
		expect(batchAfterClaim).to.deep.equal(batchBeforeClaim);
		expect((await partnerStaking.unstakeRequests(0)).batchId).to.eql(1);
	});

	it("it disburses rewards to partner wallets", async () => {
		await registerPartner(1);
		await registerPartner(2);
		await stakeMatic(1, BigNumber.from(101).mul(weiUnit));
		await stakeMatic(2, BigNumber.from(200).mul(weiUnit));
		await changeMaticXRate();
		await partnerStaking.addDueRewardsToCurrentBatch([1, 2], {
			from: manager.address,
		});
		await partnerStaking.unDelegateCurrentBatch({
			from: manager.address,
		});
		const batchBeforeClaim = await partnerStaking.batches(1);
		await stakeManagerMock.setEpoch(batchBeforeClaim.withdrawalEpoch);
		await partnerStaking.claimUnstakeRewards(0);

		const oldPartner1MaticBalance = await polygonMock.balanceOf(
			users[0].address
		);
		const oldPartner2MaticBalance = await polygonMock.balanceOf(
			users[1].address
		);
		await partnerStaking.setFeeReimbursalPercent(2);
		const feeReimbursalPercent =
			await partnerStaking.feeReimbursalPercent();
		const maticXFeePercent = await maticX.feePercent();
		const feeReimbursalMatic = BigNumber.from(100).mul(weiUnit);
		await provideFeeReimbursalMatic(feeReimbursalMatic);
		const tx = await partnerStaking.disbursePartnersReward(1, [1, 2]);
		const blockTimestamp = (await ethers.provider.getBlock("latest"))
			.timestamp;
		const partnerShare1 = await partnerStaking.getPartnerShare(1, 1);
		const partnerShare2 = await partnerStaking.getPartnerShare(1, 2);
		const newPartner1MaticBalance = await polygonMock.balanceOf(
			users[0].address
		);
		const newPartner2MaticBalance = await polygonMock.balanceOf(
			users[1].address
		);
		expect(partnerShare1.disbursedAt).to.eql(
			BigNumber.from(blockTimestamp)
		);
		expect(partnerShare2.disbursedAt).to.eql(
			BigNumber.from(blockTimestamp)
		);
		const partner1Matic = (
			await maticX.convertMaticXToMatic(partnerShare1.maticXUnstaked)
		)[0];
		const partner2Matic = (
			await maticX.convertMaticXToMatic(partnerShare2.maticXUnstaked)
		)[0];
		const partner1Reimbursal = partner1Matic
			.mul(BigNumber.from(feeReimbursalPercent))
			.div(BigNumber.from(100 - maticXFeePercent));
		const partner2Reimbursal = partner2Matic
			.mul(BigNumber.from(feeReimbursalPercent))
			.div(BigNumber.from(100 - maticXFeePercent));
		expect(await partnerStaking.feeReimbursalPool()).to.eql(
			feeReimbursalMatic.sub(partner1Reimbursal.add(partner2Reimbursal))
		);
		expect(newPartner1MaticBalance.sub(oldPartner1MaticBalance)).to.eql(
			partner1Matic.add(partner1Reimbursal)
		);
		expect(newPartner2MaticBalance.sub(oldPartner2MaticBalance)).to.eql(
			partner2Matic.add(partner2Reimbursal)
		);

		await expect(tx)
			.emit(partnerStaking, "DisbursePartnerReward")
			.withArgs(
				1,
				users[0].address,
				1,
				partner1Matic.add(partner1Reimbursal),
				partner1Reimbursal,
				partnerShare1.maticXUnstaked,
				BigNumber.from(blockTimestamp)
			);
		await expect(tx)
			.emit(partnerStaking, "DisbursePartnerReward")
			.withArgs(
				2,
				users[1].address,
				1,
				partner2Matic.add(partner2Reimbursal),
				partner2Reimbursal,
				partnerShare2.maticXUnstaked,
				BigNumber.from(blockTimestamp)
			);

		/* const receipt = await ethers.provider.getTransactionReceipt(tx4.hash);
        const iFace = new ethers.utils.Interface([
            "event DisbursePartnerReward(uint32 indexed _partnerId, address indexed _partnerAddress, uint32 indexed _batchId, uint256 _maticDisbursed,uint256 _reimbursedFee,uint256 _maticXUsed, uint256 _timestamp)",
        ]);
        // console.log(receipt);
        console.log(await partnerStaking.feeReimbursalPercent());
        console.log(await maticX.feePercent());
        console.log(
            iFace.decodeEventLog(
                "DisbursePartnerReward",
                receipt.logs[1].data,
                receipt.logs[1].topics
            )
        );
        console.log(
            iFace.decodeEventLog(
                "DisbursePartnerReward",
                receipt.logs[3].data,
                receipt.logs[3].topics
            )
        );*/
	});

	it("it disburses rewards to partner wallets - wrong partnerId", async () => {
		await registerPartner(1);
		await registerPartner(2);
		await stakeMatic(1, BigNumber.from(101).mul(weiUnit));
		await stakeMatic(2, BigNumber.from(200).mul(weiUnit));
		await changeMaticXRate();
		await partnerStaking.addDueRewardsToCurrentBatch([1, 2], {
			from: manager.address,
		});
		await partnerStaking.unDelegateCurrentBatch({
			from: manager.address,
		});
		const batchBeforeClaim = await partnerStaking.batches(1);
		await stakeManagerMock.setEpoch(batchBeforeClaim.withdrawalEpoch);
		await partnerStaking.claimUnstakeRewards(0);

		const oldPartner1MaticBalance = await polygonMock.balanceOf(
			users[0].address
		);
		const oldPartner2MaticBalance = await polygonMock.balanceOf(
			users[1].address
		);
		await partnerStaking.setFeeReimbursalPercent(2);
		const feeReimbursalPercent =
			await partnerStaking.feeReimbursalPercent();
		const maticXFeePercent = await maticX.feePercent();
		const feeReimbursalMatic = BigNumber.from(100).mul(weiUnit);
		await provideFeeReimbursalMatic(feeReimbursalMatic);
		const tx = partnerStaking.disbursePartnersReward(1, [1, 3]);
		await expect(tx).to.be.revertedWith(
			"No Partner Share for this partnerId"
		);
		const blockTimestamp = (await ethers.provider.getBlock("latest"))
			.timestamp;
		const partnerShare1 = await partnerStaking.getPartnerShare(1, 1);
		const partnerShare2 = await partnerStaking.getPartnerShare(1, 2);
		const newPartner1MaticBalance = await polygonMock.balanceOf(
			users[0].address
		);
		const newPartner2MaticBalance = await polygonMock.balanceOf(
			users[1].address
		);
		expect(partnerShare1.disbursedAt).to.eql(BigNumber.from(0));
		expect(partnerShare2.disbursedAt).to.eql(BigNumber.from(0));
		const partner1Matic = (
			await maticX.convertMaticXToMatic(partnerShare1.maticXUnstaked)
		)[0];
		const partner2Matic = (
			await maticX.convertMaticXToMatic(partnerShare2.maticXUnstaked)
		)[0];
		expect(await partnerStaking.feeReimbursalPool()).to.eql(
			feeReimbursalMatic
		);
		expect(newPartner1MaticBalance).to.eql(oldPartner1MaticBalance);
		expect(newPartner2MaticBalance).to.eql(oldPartner2MaticBalance);
	});

	it("it disburses rewards to partner wallets - inactive partner", async () => {
		await registerPartner(1);
		await registerPartner(2);
		await stakeMatic(1, BigNumber.from(101).mul(weiUnit));
		await stakeMatic(2, BigNumber.from(200).mul(weiUnit));
		await changeMaticXRate();
		await partnerStaking.addDueRewardsToCurrentBatch([1, 2], {
			from: manager.address,
		});
		await partnerStaking.unDelegateCurrentBatch({
			from: manager.address,
		});
		const batchBeforeClaim = await partnerStaking.batches(1);
		await stakeManagerMock.setEpoch(batchBeforeClaim.withdrawalEpoch);
		await partnerStaking.claimUnstakeRewards(0);

		const oldPartner1MaticBalance = await polygonMock.balanceOf(
			users[0].address
		);
		const oldPartner2MaticBalance = await polygonMock.balanceOf(
			users[1].address
		);
		await partnerStaking.setFeeReimbursalPercent(2);
		const feeReimbursalPercent =
			await partnerStaking.feeReimbursalPercent();
		const maticXFeePercent = await maticX.feePercent();
		const feeReimbursalMatic = BigNumber.from(100).mul(weiUnit);
		await provideFeeReimbursalMatic(feeReimbursalMatic);
		await partnerStaking.changePartnerStatus(2, false);
		const tx = partnerStaking.disbursePartnersReward(1, [1, 2]);
		await expect(tx).to.be.revertedWith("Inactive Partner");
		const blockTimestamp = (await ethers.provider.getBlock("latest"))
			.timestamp;
		const partnerShare1 = await partnerStaking.getPartnerShare(1, 1);
		const partnerShare2 = await partnerStaking.getPartnerShare(1, 2);
		const newPartner1MaticBalance = await polygonMock.balanceOf(
			users[0].address
		);
		const newPartner2MaticBalance = await polygonMock.balanceOf(
			users[1].address
		);
		expect(partnerShare1.disbursedAt).to.eql(BigNumber.from(0));
		expect(partnerShare2.disbursedAt).to.eql(BigNumber.from(0));
		const partner1Matic = (
			await maticX.convertMaticXToMatic(partnerShare1.maticXUnstaked)
		)[0];
		const partner2Matic = (
			await maticX.convertMaticXToMatic(partnerShare2.maticXUnstaked)
		)[0];
		expect(await partnerStaking.feeReimbursalPool()).to.eql(
			feeReimbursalMatic
		);
		expect(newPartner1MaticBalance).to.eql(oldPartner1MaticBalance);
		expect(newPartner2MaticBalance).to.eql(oldPartner2MaticBalance);
	});

	it("it disburses rewards to partner wallets - duplicate disbursals", async () => {
		await registerPartner(1);
		await registerPartner(2);
		await stakeMatic(1, BigNumber.from(101).mul(weiUnit));
		await stakeMatic(2, BigNumber.from(200).mul(weiUnit));
		await changeMaticXRate();
		await partnerStaking.addDueRewardsToCurrentBatch([1, 2], {
			from: manager.address,
		});
		await partnerStaking.unDelegateCurrentBatch({
			from: manager.address,
		});
		const batchBeforeClaim = await partnerStaking.batches(1);
		await stakeManagerMock.setEpoch(batchBeforeClaim.withdrawalEpoch);
		await partnerStaking.claimUnstakeRewards(0);

		const oldPartner1MaticBalance = await polygonMock.balanceOf(
			users[0].address
		);
		const oldPartner2MaticBalance = await polygonMock.balanceOf(
			users[1].address
		);
		await partnerStaking.setFeeReimbursalPercent(2);
		const feeReimbursalPercent =
			await partnerStaking.feeReimbursalPercent();
		const maticXFeePercent = await maticX.feePercent();
		const feeReimbursalMatic = BigNumber.from(100).mul(weiUnit);
		await provideFeeReimbursalMatic(feeReimbursalMatic);

		await partnerStaking.disbursePartnersReward(1, [2]);
		const blockTimestamp = (await ethers.provider.getBlock("latest"))
			.timestamp;
		const tx = partnerStaking.disbursePartnersReward(1, [1, 2]);

		await expect(tx).to.be.revertedWith(
			"Partner Reward has already been disbursed"
		);

		const partnerShare1 = await partnerStaking.getPartnerShare(1, 1);
		const partnerShare2 = await partnerStaking.getPartnerShare(1, 2);
		const newPartner1MaticBalance = await polygonMock.balanceOf(
			users[0].address
		);
		const newPartner2MaticBalance = await polygonMock.balanceOf(
			users[1].address
		);
		expect(partnerShare1.disbursedAt).to.eql(BigNumber.from(0));
		expect(partnerShare2.disbursedAt).to.eql(
			BigNumber.from(blockTimestamp)
		);
		const partner2Matic = (
			await maticX.convertMaticXToMatic(partnerShare2.maticXUnstaked)
		)[0];
		const partner2Reimbursal = partner2Matic
			.mul(BigNumber.from(feeReimbursalPercent))
			.div(BigNumber.from(100 - maticXFeePercent));
		expect(await partnerStaking.feeReimbursalPool()).to.eql(
			feeReimbursalMatic.sub(partner2Reimbursal)
		);
		expect(newPartner1MaticBalance).to.eql(oldPartner1MaticBalance);
		expect(newPartner2MaticBalance.sub(oldPartner2MaticBalance)).to.eql(
			partner2Matic.add(partner2Reimbursal)
		);
	});
});
