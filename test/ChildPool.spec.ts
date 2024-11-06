import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { reset } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { AbiCoder, ContractTransactionResponse } from "ethers";
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
} from "../typechain-types";

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
	const wei = 10n ** 18n;

	let childPoolAddress: string;
	let maticXAddress: string;
	let polygonMockAddress: string;
	let validatorRegistryAddress: string;
	let stakeManagerMockAddress: string;
	let fxRootMockAddress: string;
	let fxStateRootTunnelAddress: string;
	let fxStateChildTunnelAddress: string;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let rateProviderAddress: string;

	let mintAndApproveMatic: (
		signer: SignerWithAddress,
		amount: bigint
	) => Promise<void>;
	let maticXApproveForChildPool: (
		signer: SignerWithAddress,
		amount: bigint
	) => Promise<void>;
	let mintMaticX: (
		signer: SignerWithAddress,
		amount: bigint
	) => Promise<ContractTransactionResponse>;
	let swapMaticForMaticXViaInstantPool: (
		signer: SignerWithAddress,
		amount: bigint
	) => Promise<void>;
	let provideInstantPoolMatic: (
		signer: SignerWithAddress,
		amount: bigint
	) => Promise<void>;
	let provideInstantPoolMaticX: (
		signer: SignerWithAddress,
		amount: bigint
	) => Promise<void>;
	let requestMaticXSwap: (
		signer: SignerWithAddress,
		amount: bigint
	) => Promise<unknown>;
	let claimMaticXSwap: (
		signer: SignerWithAddress,
		index: bigint
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	) => Promise<any>;

	before(() => {
		mintAndApproveMatic = async (signer, amount) => {
			maticXAddress = await maticX.getAddress();
			const signerERC = polygonMock.connect(signer);
			await signerERC.mint(amount);
			await signerERC.approve(maticXAddress, amount);
		};

		maticXApproveForChildPool = async (signer, amount) => {
			childPoolAddress = await childPool.getAddress();
			const signerMaticX = maticX.connect(signer);
			await signerMaticX.approve(childPoolAddress, amount);
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
			amount: bigint
		) => {
			const signerChildPool = childPool.connect(signer);
			await signerChildPool.swapMaticForMaticXViaInstantPool({
				value: amount,
			});
		};

		requestMaticXSwap = async (
			signer: SignerWithAddress,
			amount: bigint
		) => {
			await mintMaticX(signer, amount);
			await maticXApproveForChildPool(signer, amount);
			const signerChildPool = childPool.connect(signer);
			return await signerChildPool.requestMaticXSwap(amount);
		};

		claimMaticXSwap = async (signer: SignerWithAddress, index: bigint) => {
			const signerChildPool = childPool.connect(signer);
			return await signerChildPool.claimMaticXSwap(index);
		};
	});

	beforeEach(async () => {
		await reset();

		[deployer, ...users] = await ethers.getSigners();
		manager = deployer;
		treasury = users[1];
		instantPoolOwner = deployer;
		polygonMock = await (
			await ethers.getContractFactory("PolygonMock")
		).deploy();
		polygonMockAddress = await polygonMock.getAddress();

		fxRootMock = await (
			await ethers.getContractFactory("FxRootMock")
		).deploy();
		fxRootMockAddress = await fxRootMock.getAddress();

		fxStateChildTunnel = await (
			await ethers.getContractFactory("FxStateChildTunnel")
		).deploy(fxRootMockAddress);
		fxStateChildTunnelAddress = await fxStateChildTunnel.getAddress();

		fxStateRootTunnel = await (
			await ethers.getContractFactory("FxStateRootTunnel")
		).deploy(manager.address, fxRootMockAddress, manager.address);
		fxStateRootTunnelAddress = await fxStateRootTunnel.getAddress();

		rateProvider = await (
			await ethers.getContractFactory("RateProvider")
		).deploy(fxStateChildTunnelAddress);
		rateProviderAddress = await rateProvider.getAddress();

		stakeManagerMock = await (
			await ethers.getContractFactory("StakeManagerMock")
		).deploy(polygonMockAddress, polygonMockAddress);
		await stakeManagerMock.waitForDeployment();
		stakeManagerMockAddress = await stakeManagerMock.getAddress();

		validatorRegistry = (await upgrades.deployProxy(
			await ethers.getContractFactory("ValidatorRegistry"),
			[
				stakeManagerMockAddress,
				polygonMockAddress,
				ethers.ZeroAddress,
				manager.address,
			]
		)) as unknown as ValidatorRegistry;
		validatorRegistryAddress = await validatorRegistry.getAddress();

		maticX = (await upgrades.deployProxy(
			await ethers.getContractFactory("MaticX"),
			[
				validatorRegistryAddress,
				stakeManagerMockAddress,
				polygonMockAddress,
				manager.address,
				treasury.address,
			]
		)) as unknown as MaticX;
		maticXAddress = await maticX.getAddress();

		childPool = (await upgrades.deployProxy(
			await ethers.getContractFactory("ChildPool"),
			[
				fxStateChildTunnelAddress,
				maticXAddress,
				manager.address,
				instantPoolOwner.address,
				treasury.address,
				10,
			]
		)) as unknown as ChildPool;
		childPoolAddress = await childPool.getAddress();

		await validatorRegistry.setMaticX(maticXAddress);
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
		await maticX.setFxStateRootTunnel(fxStateRootTunnelAddress);
		await fxStateRootTunnel.setMaticX(maticXAddress);
		await fxStateRootTunnel.setFxChildTunnel(fxStateChildTunnelAddress);
		await fxStateChildTunnel.setFxRootTunnel(fxStateRootTunnelAddress);
		await childPool.setFxStateChildTunnel(fxStateChildTunnelAddress);
		await childPool.setMaticXSwapLockPeriod(4);

		const abiCoder = new AbiCoder();
		await fxRootMock.sendMessageToChildWithAddress(
			fxStateChildTunnelAddress,
			fxStateRootTunnelAddress,
			abiCoder.encode(["uint256", "uint256"], [1000n, 1000n])
		);
	});

	it("get contract addresses", async () => {
		const result = await childPool.getContracts();
		expect(result).to.include(fxStateChildTunnelAddress);
		expect(result).to.include(maticXAddress);
		expect(result).to.include("0x0000000000000000000000000000000000000000");
	});

	it("get remaining amount after instant withdrawal fee deduction", async () => {
		const result =
			await childPool.getAmountAfterInstantWithdrawalFees(1000);
		expect(result).to.eql([999n, 1n]);
	});

	it("gives the amount of maticX if converted from matic", async () => {
		const result = await childPool.convertMaticToMaticX(100);
		expect(result).to.eql([100n, 1000n, 1000n]);
	});

	it("get maticX from matic via instant pool", async () => {
		expect(await childPool.instantPoolMaticX()).to.eql(0n);
		await mintMaticX(instantPoolOwner, ethers.parseEther("1000.0"));
		expect(await maticX.balanceOf(instantPoolOwner.address)).to.eql(
			1000n * wei
		);
		await provideInstantPoolMaticX(
			instantPoolOwner,
			ethers.parseEther("1000.0")
		);
		expect(await childPool.instantPoolMaticX()).to.eql(1000n * wei);
		expect(await maticX.balanceOf(instantPoolOwner.address)).to.eql(0n);
		expect(await maticX.balanceOf(users[0].address)).to.eql(0n);
		await swapMaticForMaticXViaInstantPool(
			users[0],
			ethers.parseEther("2")
		);
		expect(await maticX.balanceOf(users[0].address)).to.eql(2n * wei);
	});

	it("request maticX withdrawal via instant pool - fails because of insufficient amount", async () => {
		// check for initial instant pool amount
		expect(await childPool.instantPoolMatic()).to.eql(0n);
		const maticXAmount = ethers.parseEther("50.0");
		await expect(
			requestMaticXSwap(users[0], maticXAmount)
		).to.be.revertedWith(
			"Sorry we don't have enough matic in the instant pool to facilitate this swap"
		);
	});

	it("request maticX withdrawal via instant pool", async () => {
		// check for initial instant pool amount
		expect(await childPool.instantPoolMatic()).to.eql(0n);
		// add matic to instant pool
		await provideInstantPoolMatic(
			instantPoolOwner,
			ethers.parseEther("1000.0")
		);
		// check for new value of instant pool
		expect(await childPool.instantPoolMatic()).to.eql(1000n * wei);
		const maticXAmount = ethers.parseEther("50.0");
		const [maticAmount, ,] =
			await childPool.convertMaticXToMatic(maticXAmount);
		const requestResult = await requestMaticXSwap(users[0], maticXAmount);
		// 50 maticX deposited in instant pool
		expect(await childPool.instantPoolMaticX()).to.eql(50n * wei);
		// 50 matic deducted from instant pool matic
		expect(await childPool.instantPoolMatic()).to.eql(950n * wei);
		// 50 matic locked away
		expect(await childPool.claimedMatic()).to.eql(50n * wei);
		// should emit RequestMaticXSwap event
		await expect(requestResult)
			.emit(childPool, "RequestMaticXSwap")
			.withArgs(users[0].address, maticXAmount, maticAmount, 0n);

		const withdrawalRequest = (
			await childPool.getUserMaticXSwapRequests(users[0].address)
		)[0];
		// amount should be equal to 50 matic
		expect(withdrawalRequest.amount).to.eql(50n * wei);
		// withdrawal delay of 1 hour (14400 seconds)
		expect(
			withdrawalRequest.withdrawalTime - withdrawalRequest.requestTime
		).to.eql(14400n);
	});

	it("claim maticX swap - fails because of lock-in period", async () => {
		await provideInstantPoolMatic(
			instantPoolOwner,
			ethers.parseEther("1000.0")
		);
		const maticXAmount = ethers.parseEther("50.0");
		await requestMaticXSwap(users[0], maticXAmount);
		await expect(claimMaticXSwap(users[0], 0n)).to.be.revertedWith(
			"Please wait for the bonding period to get over"
		);
	});

	it("claim maticX swap - fails because of wrong index", async () => {
		await provideInstantPoolMatic(
			instantPoolOwner,
			ethers.parseEther("1000.0")
		);
		const maticXAmount = ethers.parseEther("50.0");
		await requestMaticXSwap(users[0], maticXAmount);
		await expect(claimMaticXSwap(users[0], 1n)).to.be.revertedWith(
			"Invalid Index"
		);
	});

	it("claim maticX swap - fails because of wrong user address", async () => {
		await provideInstantPoolMatic(
			instantPoolOwner,
			ethers.parseEther("1000.0")
		);
		const maticXAmount = ethers.parseEther("50.0");
		await requestMaticXSwap(users[0], maticXAmount);
		await expect(claimMaticXSwap(users[1], 0n)).to.be.revertedWith(
			"Invalid Index"
		);
	});

	it("claim maticX swap - succeeds", async () => {
		await provideInstantPoolMatic(
			instantPoolOwner,
			ethers.parseEther("1000.0")
		);
		const maticXAmount = ethers.parseEther("50.0");
		const [maticAmount, ,] =
			await childPool.convertMaticXToMatic(maticXAmount);
		await requestMaticXSwap(users[0], maticXAmount);

		// increase block time by 5 hours
		await ethers.provider.send("evm_increaseTime", [3600 * 5]);
		await ethers.provider.send("evm_mine", []);

		// old matic balance of user
		const oldMaticBalanceOfUser = await ethers.provider.getBalance(
			users[0]
		);

		const claimResult = await claimMaticXSwap(users[0], 0n);
		const txReceipt = await claimResult.wait();
		const gasUsed = txReceipt.cumulativeGasUsed * txReceipt.gasPrice;
		const newMaticBalanceOfUser = await ethers.provider.getBalance(
			users[0]
		);

		// event fired
		await expect(claimResult)
			.emit(childPool, "ClaimMaticXSwap")
			.withArgs(users[0].address, 0n, maticAmount);
		// no remaining withdrawal requests
		expect(
			await childPool.getUserMaticXSwapRequests(users[0].address)
		).to.eql([]);
		// new balance - old balance = gas + matic claimed
		expect(
			newMaticBalanceOfUser - oldMaticBalanceOfUser + BigInt(gasUsed)
		).to.eql(maticAmount);
	});
});
