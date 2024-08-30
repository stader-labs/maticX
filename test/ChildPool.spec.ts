import { expect } from "chai";
import { Transaction, utils } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
	ChildPool,
	FxRootMock,
	FxStateChildTunnel,
	FxStateRootTunnel,
	MaticX,
	PolygonMock,
	RateProvider,
	StakeManagerMock,
	ValidatorRegistry,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";

describe("ChildPool", () => {
	let childPool: ChildPool;
	let deployer: SignerWithAddress;
	let manager: SignerWithAddress;
	let instantPoolOwner: SignerWithAddress;
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
	const wei = BigNumber.from(10).pow(18);

	let mintAndApproveMatic: (
		signer: SignerWithAddress,
		amount: BigNumberish
	) => Promise<void>;
	let maticXApproveForChildPool: (
		signer: SignerWithAddress,
		amount: BigNumberish
	) => Promise<void>;
	let mintMaticX: (
		signer: SignerWithAddress,
		amount: BigNumber
	) => Promise<Transaction>;
	let swapMaticForMaticXViaInstantPool: (
		signer: SignerWithAddress,
		amount: BigNumberish
	) => Promise<void>;
	let provideInstantPoolMatic: (
		signer: SignerWithAddress,
		amount: BigNumberish
	) => Promise<void>;
	let provideInstantPoolMaticX: (
		signer: SignerWithAddress,
		amount: BigNumberish
	) => Promise<void>;
	let requestMaticXSwap: (
		signer: SignerWithAddress,
		amount: BigNumber
	) => Promise<unknown>;
	let claimMaticXSwap: (
		signer: SignerWithAddress,
		index: BigNumber
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	) => Promise<any>;

	before(() => {
		mintAndApproveMatic = async (signer, amount) => {
			const signerERC = polygonMock.connect(signer);
			await signerERC.mint(amount);
			await signerERC.approve(maticX.address, amount);
		};

		maticXApproveForChildPool = async (signer, amount) => {
			const signerMaticX = maticX.connect(signer);
			await signerMaticX.approve(childPool.address, amount);
		};

		mintMaticX = async (signer, amount) => {
			await mintAndApproveMatic(signer, amount);
			const signerMaticX = maticX.connect(signer);
			return await signerMaticX.submit(amount);
		};

		provideInstantPoolMatic = async (signer, amount) => {
			// await mintAndApproveMatic(signer, amount);
			const signerChildPool = childPool.connect(signer);
			await signerChildPool.provideInstantPoolMatic({ value: amount });
		};

		provideInstantPoolMaticX = async (signer, amount) => {
			await maticXApproveForChildPool(signer, amount);
			const signerChildPool = childPool.connect(signer);
			await signerChildPool.provideInstantPoolMaticX(amount);
		};

		swapMaticForMaticXViaInstantPool = async (
			signer: SignerWithAddress,
			amount: BigNumberish
		) => {
			const signerChildPool = childPool.connect(signer);
			await signerChildPool.swapMaticForMaticXViaInstantPool({
				value: amount,
			});
		};

		requestMaticXSwap = async (
			signer: SignerWithAddress,
			amount: BigNumber
		) => {
			await mintMaticX(signer, amount);
			await maticXApproveForChildPool(signer, amount);
			const signerChildPool = childPool.connect(signer);
			return await signerChildPool.requestMaticXSwap(amount);
		};

		claimMaticXSwap = async (
			signer: SignerWithAddress,
			index: BigNumber
		) => {
			const signerChildPool = childPool.connect(signer);
			return await signerChildPool.claimMaticXSwap(index);
		};
	});

	beforeEach(async () => {
		[deployer, ...users] = await ethers.getSigners();
		manager = deployer;
		treasury = users[1];
		instantPoolOwner = deployer;
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
				instantPoolOwner.address,
				treasury.address,
			]
		)) as MaticX;
		await maticX.deployed();

		childPool = (await upgrades.deployProxy(
			await ethers.getContractFactory("ChildPool"),
			[
				fxStateChildTunnel.address,
				maticX.address,
				manager.address,
				instantPoolOwner.address,
				treasury.address,
				10,
			]
		)) as ChildPool;
		await childPool.deployed();

		await validatorRegistry.setMaticX(maticX.address);
		await stakeManagerMock.createValidator(1);
		await validatorRegistry.addValidator(1);
		await validatorRegistry.grantRole(
			await validatorRegistry.BOT(),
			manager.address
		);
		await validatorRegistry.setPreferredDepositValidatorId(1);
		await validatorRegistry.setPreferredWithdrawalValidatorId(1);
		await stakeManagerMock.createValidator(2);
		await validatorRegistry.addValidator(2);
		await maticX.setFxStateRootTunnel(fxStateRootTunnel.address);
		await fxStateRootTunnel.setMaticX(maticX.address);
		await fxStateRootTunnel.setFxChildTunnel(fxStateChildTunnel.address);
		await fxStateChildTunnel.setFxRootTunnel(fxStateRootTunnel.address);
		await childPool.setFxStateChildTunnel(fxStateChildTunnel.address);
		await childPool.setMaticXSwapLockPeriod(4);

		const abiCoder = new utils.AbiCoder();
		await fxRootMock.sendMessageToChildWithAddress(
			fxStateChildTunnel.address,
			fxStateRootTunnel.address,
			abiCoder.encode(["uint", "uint"], [1000, 1000])
		);
	});

	it("get contract addresses", async () => {
		const result = await childPool.getContracts();
		expect(result).to.include(fxStateChildTunnel.address);
		expect(result).to.include(maticX.address);
		expect(result).to.include("0x0000000000000000000000000000000000000000");
	});

	it("get remaining amount after instant withdrawal fee deduction", async () => {
		const result = await childPool.getAmountAfterInstantWithdrawalFees(
			1000
		);
		expect(result).to.eql([BigNumber.from("999"), BigNumber.from("1")]);
	});

	it("gives the amount of maticX if converted from matic", async () => {
		const result = await childPool.convertMaticToMaticX(100);
		expect(result).to.eql([
			BigNumber.from("100"),
			BigNumber.from("1000"),
			BigNumber.from("1000"),
		]);
	});

	it("get maticX from matic via instant pool", async () => {
		expect(await childPool.instantPoolMaticX()).to.eql(BigNumber.from("0"));
		await mintMaticX(instantPoolOwner, ethers.utils.parseEther("1000.0"));
		expect(await maticX.balanceOf(instantPoolOwner.address)).to.eql(
			BigNumber.from(1000).mul(wei)
		);
		await provideInstantPoolMaticX(
			instantPoolOwner,
			ethers.utils.parseEther("1000.0")
		);
		expect(await childPool.instantPoolMaticX()).to.eql(
			BigNumber.from("1000").mul(wei)
		);
		expect(await maticX.balanceOf(instantPoolOwner.address)).to.eql(
			BigNumber.from("0").mul(wei)
		);
		expect(await maticX.balanceOf(users[0].address)).to.eql(
			BigNumber.from("0").mul(wei)
		);
		await swapMaticForMaticXViaInstantPool(
			users[0],
			ethers.utils.parseEther("2")
		);
		expect(await maticX.balanceOf(users[0].address)).to.eql(
			BigNumber.from("2").mul(wei)
		);
	});

	it("request maticX withdrawal via instant pool - fails because of insufficient amount", async () => {
		// check for initial instant pool amount
		expect(await childPool.instantPoolMatic()).to.eql(BigNumber.from("0"));
		const maticXAmount = ethers.utils.parseEther("50.0");
		await expect(
			requestMaticXSwap(users[0], maticXAmount)
		).to.be.revertedWith(
			"Sorry we don't have enough matic in the instant pool to facilitate this swap"
		);
	});

	it("request maticX withdrawal via instant pool", async () => {
		// check for initial instant pool amount
		expect(await childPool.instantPoolMatic()).to.eql(BigNumber.from("0"));
		// add matic to instant pool
		await provideInstantPoolMatic(
			instantPoolOwner,
			ethers.utils.parseEther("1000.0")
		);
		// check for new value of instant pool
		expect(await childPool.instantPoolMatic()).to.eql(
			BigNumber.from("1000").mul(wei)
		);
		const maticXAmount = ethers.utils.parseEther("50.0");
		const [maticAmount, ,] = await childPool.convertMaticXToMatic(
			maticXAmount
		);
		const requestResult = await requestMaticXSwap(users[0], maticXAmount);
		// 50 maticX deposited in instant pool
		expect(await childPool.instantPoolMaticX()).to.eql(
			BigNumber.from("50").mul(wei)
		);
		// 50 matic deducted from instant pool matic
		expect(await childPool.instantPoolMatic()).to.eql(
			BigNumber.from("950").mul(wei)
		);
		// 50 matic locked away
		expect(await childPool.claimedMatic()).to.eql(
			BigNumber.from("50").mul(wei)
		);
		// should emit RequestMaticXSwap event
		await expect(requestResult)
			.emit(childPool, "RequestMaticXSwap")
			.withArgs(users[0].address, maticXAmount, maticAmount, 0);

		const withdrawalRequest = (
			await childPool.getUserMaticXSwapRequests(users[0].address)
		)[0];
		// amount should be equal to 50 matic
		expect(withdrawalRequest.amount).to.eql(BigNumber.from("50").mul(wei));
		// withdrawal delay of 1 hour (14400 seconds)
		expect(
			withdrawalRequest.withdrawalTime.sub(withdrawalRequest.requestTime)
		).to.eql(BigNumber.from(14400));
	});

	it("claim maticX swap - fails because of lock-in period", async () => {
		await provideInstantPoolMatic(
			instantPoolOwner,
			ethers.utils.parseEther("1000.0")
		);
		const maticXAmount = ethers.utils.parseEther("50.0");
		await requestMaticXSwap(users[0], maticXAmount);
		await expect(
			claimMaticXSwap(users[0], BigNumber.from(0))
		).to.be.revertedWith("Please wait for the bonding period to get over");
	});

	it("claim maticX swap - fails because of wrong index", async () => {
		await provideInstantPoolMatic(
			instantPoolOwner,
			ethers.utils.parseEther("1000.0")
		);
		const maticXAmount = ethers.utils.parseEther("50.0");
		await requestMaticXSwap(users[0], maticXAmount);
		await expect(
			claimMaticXSwap(users[0], BigNumber.from(1))
		).to.be.revertedWith("Invalid Index");
	});

	it("claim maticX swap - fails because of wrong user address", async () => {
		await provideInstantPoolMatic(
			instantPoolOwner,
			ethers.utils.parseEther("1000.0")
		);
		const maticXAmount = ethers.utils.parseEther("50.0");
		await requestMaticXSwap(users[0], maticXAmount);
		await expect(
			claimMaticXSwap(users[1], BigNumber.from(0))
		).to.be.revertedWith("Invalid Index");
	});

	it("claim maticX swap - succeeds", async () => {
		await provideInstantPoolMatic(
			instantPoolOwner,
			ethers.utils.parseEther("1000.0")
		);
		const maticXAmount = ethers.utils.parseEther("50.0");
		const [maticAmount, ,] = await childPool.convertMaticXToMatic(
			maticXAmount
		);
		await requestMaticXSwap(users[0], maticXAmount);

		// increase block time by 5 hours
		await ethers.provider.send("evm_increaseTime", [3600 * 5]);
		await ethers.provider.send("evm_mine", []);

		// old matic balance of user
		const oldMaticBalanceOfUser = await users[0].getBalance();

		const claimResult = await claimMaticXSwap(users[0], BigNumber.from(0));
		const txReceipt = await claimResult.wait();
		const gasUsed = txReceipt.cumulativeGasUsed.mul(
			txReceipt.effectiveGasPrice
		);

		const newMaticBalanceOfUser = await users[0].getBalance();

		// event fired
		await expect(claimResult)
			.emit(childPool, "ClaimMaticXSwap")
			.withArgs(users[0].address, 0, maticAmount);
		// no remaining withdrawal requests
		expect(
			await childPool.getUserMaticXSwapRequests(users[0].address)
		).to.eql([]);
		// new balance - old balance = gas + matic claimed
		expect(
			newMaticBalanceOfUser.sub(oldMaticBalanceOfUser).add(gasUsed)
		).to.eql(BigNumber.from(maticAmount));
	});
});
