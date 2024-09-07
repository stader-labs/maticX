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
	FxRootMock,
	FxStateRootTunnel,
	FxStateChildTunnel,
	RateProvider,
} from "../typechain";

describe.skip("MaticX (Old)", function () {
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

	let mint: (
		signer: SignerWithAddress,
		amount: BigNumberish
	) => Promise<void>;
	let maticApprove: (
		signer: SignerWithAddress,
		amount: BigNumberish
	) => Promise<void>;
	let submitWithoutApprove: (
		signer: SignerWithAddress,
		amount: BigNumberish
	) => Promise<void>;
	let submit: (
		signer: SignerWithAddress,
		amount: BigNumberish
	) => Promise<Transaction>;
	let requestWithdraw: (
		signer: SignerWithAddress,
		amount: BigNumberish
	) => Promise<Transaction>;
	let claimWithdrawal: (
		signer: SignerWithAddress,
		idx: BigNumberish
	) => Promise<Transaction>;
	let migrateDelegation: (
		signer: SignerWithAddress,
		fromValidatorId: BigNumberish,
		toValidatorId: BigNumberish,
		amount: BigNumberish
	) => Promise<Transaction>;
	let stakeRewardsAndDistributeFees: (
		signer: SignerWithAddress,
		validatorId: BigNumberish
	) => Promise<Transaction>;
	let setFeePercent: (
		signer: SignerWithAddress,
		feePercent: BigNumberish
	) => Promise<Transaction>;
	let mintAndTransferMatic: (
		signer: SignerWithAddress,
		amount: BigNumber,
		to: string
	) => Promise<Transaction>;

	before(() => {
		mint = async (signer, amount) => {
			const signerERC = polygonMock.connect(signer);
			await signerERC.mint(amount);
		};

		maticApprove = async (signer, amount) => {
			const signerERC20 = polygonMock.connect(signer);
			await signerERC20.approve(maticX.address, amount);
		};

		mintAndTransferMatic = async (signer, amount, to) => {
			const signerERC = polygonMock.connect(signer);
			await signerERC.mint(amount);
			await signerERC.approve(to, amount);
			return await signerERC.transfer(to, amount);
		};

		submitWithoutApprove = async (signer, amount) => {
			const signerMaticX = maticX.connect(signer);
			await signerMaticX.submit(amount);
		};

		submit = async (signer, amount) => {
			await maticApprove(signer, amount);

			const signerMaticX = maticX.connect(signer);
			return signerMaticX.submit(amount);
		};

		requestWithdraw = async (signer, amount) => {
			const signerMaticX = maticX.connect(signer);
			await signerMaticX.approve(maticX.address, amount);
			return signerMaticX.requestWithdraw(amount);
		};

		claimWithdrawal = async (signer, idx) => {
			const signerMaticX = maticX.connect(signer);
			return signerMaticX.claimWithdrawal(idx);
		};

		migrateDelegation = async (
			signer,
			fromValidatorId,
			toValidatorId,
			amount
		) => {
			const signerMaticX = maticX.connect(signer);
			return await signerMaticX.migrateDelegation(
				fromValidatorId,
				toValidatorId,
				amount
			);
		};

		stakeRewardsAndDistributeFees = async (signer, validatorId) => {
			const signerMaticX = maticX.connect(signer);
			return signerMaticX.stakeRewardsAndDistributeFees(validatorId);
		};

		setFeePercent = async (signer, feePercent) => {
			const signerMaticX = maticX.connect(signer);
			return signerMaticX.setFeePercent(feePercent);
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
				treasury.address,
			]
		)) as MaticX;
		await maticX.deployed();

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
		await maticX.setupBotAdmin();
		await maticX.grantRole(await maticX.BOT(), instantPoolOwner.address);
	});

	it("Should submit successfully", async () => {
		const totalAmount = ethers.utils.parseEther("1");
		const user = users[0];

		await mint(user, totalAmount);

		const approveAmount = ethers.utils.parseEther("0.4");
		// Approve & Submit individually 0.4
		await maticApprove(user, approveAmount);
		await submitWithoutApprove(user, approveAmount);

		let userBalance = await maticX.balanceOf(user.address);
		expect(userBalance).to.equal(approveAmount);

		// Approve & Submit individually 0.6
		const remainingAmount = ethers.utils.parseEther("0.6");
		const submitTx = await submit(user, remainingAmount);
		await expect(submitTx)
			.emit(maticX, "Submit")
			.withArgs(user.address, remainingAmount);
		await expect(submitTx)
			.emit(maticX, "Delegate")
			.withArgs(1, remainingAmount);

		userBalance = await maticX.balanceOf(user.address);
		expect(userBalance).to.equal(totalAmount);
	});

	it("fails when submit amount is greater than signer balance", async () => {
		const user = users[0];
		let userMaticXBalance = await maticX.balanceOf(user.address);
		expect(userMaticXBalance).to.equal(0);

		const amount = ethers.utils.parseEther("1");
		await mint(user, amount);

		await expect(submitWithoutApprove(user, amount)).to.be.revertedWith(
			"ERC20: insufficient allowance"
		);

		await expect(
			submit(user, ethers.utils.parseEther("2"))
		).to.be.revertedWith("ERC20: transfer amount exceeds balance");

		userMaticXBalance = await maticX.balanceOf(user.address);
		expect(userMaticXBalance).to.equal(0);
	});

	it("Should request withdraw from the contract successfully", async () => {
		const amount = ethers.utils.parseEther("1");
		const user = users[0];

		await mint(user, amount);

		const submitTx = await submit(user, amount);
		await expect(submitTx)
			.emit(maticX, "Submit")
			.withArgs(user.address, amount);
		await expect(submitTx).emit(maticX, "Delegate").withArgs(1, amount);

		await expect(await requestWithdraw(user, amount))
			.emit(maticX, "RequestWithdraw")
			.withArgs(user.address, amount, amount);

		const userBalance = await maticX.balanceOf(user.address);
		expect(userBalance).to.equal(0);
	});

	it("WithdrawalRequest should have correct share amount", async () => {
		const expectedAmount = ethers.utils.parseEther("1");
		const user = users[0];

		await mint(user, expectedAmount);

		const submitTx = await submit(user, expectedAmount);
		await expect(submitTx)
			.emit(maticX, "Submit")
			.withArgs(user.address, expectedAmount);
		await expect(submitTx)
			.emit(maticX, "Delegate")
			.withArgs(1, expectedAmount);

		await expect(await requestWithdraw(user, expectedAmount))
			.emit(maticX, "RequestWithdraw")
			.withArgs(user.address, expectedAmount, expectedAmount);

		const amount = await maticX.getSharesAmountOfUserWithdrawalRequest(
			user.address,
			0
		);
		expect(expectedAmount).to.equal(amount);
	});

	it("Should claim withdrawals after submitting to contract successfully", async () => {
		const submitAmounts: string[] = [];
		const withdrawAmounts: string[] = [];

		const [minAmount, maxAmount] = [0.005, 0.01];
		const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;

		for (let i = 0; i < delegatorsAmount; i++) {
			submitAmounts.push(
				(Math.random() * (maxAmount - minAmount) + minAmount).toFixed(3)
			);
			const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);

			await mint(users[i], submitAmountWei);

			const submitTx = await submit(users[i], submitAmountWei);
			await expect(submitTx)
				.emit(maticX, "Submit")
				.withArgs(users[i].address, submitAmountWei);
			await expect(submitTx)
				.emit(maticX, "Delegate")
				.withArgs(1, submitAmountWei);
		}

		await stakeManagerMock.setEpoch(1);

		for (let i = 0; i < delegatorsAmount; i++) {
			withdrawAmounts.push(
				(
					Math.random() * (Number(submitAmounts[i]) - minAmount) +
					minAmount
				).toFixed(3)
			);
			const withdrawAmountWei = ethers.utils.parseEther(
				withdrawAmounts[i]
			);

			await expect(await requestWithdraw(users[i], withdrawAmountWei))
				.emit(maticX, "RequestWithdraw")
				.withArgs(
					users[i].address,
					withdrawAmountWei,
					withdrawAmountWei
				);
		}

		const withdrawalDelay = await stakeManagerMock.withdrawalDelay();
		const currentEpoch = await stakeManagerMock.epoch();

		await stakeManagerMock.setEpoch(withdrawalDelay.add(currentEpoch));

		for (let i = 0; i < delegatorsAmount; i++) {
			await expect(await claimWithdrawal(users[i], 0))
				.emit(maticX, "ClaimWithdrawal")
				.withArgs(
					users[i].address,
					0,
					ethers.utils.parseEther(withdrawAmounts[i])
				);
			const balanceAfter = await polygonMock.balanceOf(users[i].address);

			expect(balanceAfter).to.equal(
				ethers.utils.parseEther(withdrawAmounts[i])
			);
		}
	});

	it.skip("Should stake rewards to a validator successfully without using instant pool matic", async () => {
		const submitAmounts: string[] = [];

		const [minAmount, maxAmount] = [0.005, 0.01];
		const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;

		for (let i = 0; i < delegatorsAmount; i++) {
			submitAmounts.push(
				(Math.random() * (maxAmount - minAmount) + minAmount).toFixed(3)
			);
			const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);
			await mint(users[i], submitAmountWei);
			await submit(users[i], submitAmountWei);
		}

		const instantPoolMatic = ethers.utils.parseEther("10");
		await mint(deployer, instantPoolMatic);
		await maticApprove(deployer, instantPoolMatic);
		// await provideInstantPoolMatic(deployer, instantPoolMatic);
		expect(await polygonMock.balanceOf(maticX.address)).to.equal(
			instantPoolMatic
		);

		await expect(await setFeePercent(manager, 10))
			.emit(maticX, "SetFeePercent")
			.withArgs(10);
		const rewards = 1000000;
		const feePercent = await maticX.feePercent();
		const treasuryFee = (rewards * feePercent) / 100;
		const stakedAmount = rewards - treasuryFee;
		await polygonMock.mintTo(maticX.address, rewards);

		const stakeRewardsAndDistributeFeesTx =
			await stakeRewardsAndDistributeFees(manager, 1);
		await expect(stakeRewardsAndDistributeFeesTx)
			.emit(maticX, "StakeRewards")
			.withArgs(1, stakedAmount);
		await expect(stakeRewardsAndDistributeFeesTx)
			.emit(maticX, "DistributeFees")
			.withArgs(treasury.address, treasuryFee);

		expect(await polygonMock.balanceOf(maticX.address)).to.equal(
			instantPoolMatic
		);
	});

	it("Should migrate validator stake to another validator successfully", async () => {
		const user = users[0];

		await mint(user, 100);
		await submit(user, 100);

		await stakeManagerMock.createValidator(123);
		await validatorRegistry.addValidator(123);

		await expect(await migrateDelegation(manager, 1, 123, 100))
			.emit(maticX, "MigrateDelegation")
			.withArgs(1, 123, 100);
	});

	it("Should send correct message from L1 to L2", async () => {
		const user = users[0];
		const mintAmount = 1000000;
		const withdrawAmount = 400000;
		const rewardsAmount = 300000;

		await mint(user, mintAmount);
		// Submitting twice to skip the edge case that occurs when there is only 0 deposit at the beginning
		await submit(user, 1000000 - 200000);
		await submit(user, 1000000 - 800000);

		const [totalSharesAfterDeposit, totalPooledMaticAfterDeposit] =
			await fxStateChildTunnel.getReserves();
		const rateAfterDeposit = await rateProvider.getRate();
		expect(totalSharesAfterDeposit).to.equal(mintAmount);
		expect(totalPooledMaticAfterDeposit).to.equal(mintAmount);
		const expectedRateAfterDeposit: BigNumberish = BigNumber.from(
			"1000000000000000000"
		)
			.mul(totalPooledMaticAfterDeposit)
			.div(totalSharesAfterDeposit);
		expect(rateAfterDeposit).to.equal(expectedRateAfterDeposit);

		await requestWithdraw(user, withdrawAmount);

		const [totalSharesAfterWithdraw, totalPooledMaticAfterWithdraw] =
			await fxStateChildTunnel.getReserves();
		const rateAfterWithdraw = await rateProvider.getRate();
		expect(totalSharesAfterWithdraw).to.equal(mintAmount - withdrawAmount);
		expect(totalPooledMaticAfterWithdraw).to.equal(
			mintAmount - withdrawAmount
		);
		const expectedRateAfterWithdraw: BigNumberish = BigNumber.from(
			"1000000000000000000"
		)
			.mul(totalPooledMaticAfterWithdraw)
			.div(totalSharesAfterWithdraw);
		expect(rateAfterWithdraw).to.equal(expectedRateAfterWithdraw);

		await polygonMock.mintTo(maticX.address, rewardsAmount);
		await stakeRewardsAndDistributeFees(manager, 1);

		const rewardsAfterFee =
			(rewardsAmount * (100 - (await maticX.feePercent()))) / 100;
		const [totalSharesAfterRewards, totalPooledMaticAfterRewards] =
			await fxStateChildTunnel.getReserves();
		const rateAfterRewards = await rateProvider.getRate();
		expect(totalSharesAfterRewards).to.equal(mintAmount - withdrawAmount);
		expect(totalPooledMaticAfterRewards).to.equal(
			mintAmount - withdrawAmount + rewardsAfterFee
		);
		const expectedRateAfterRewards: BigNumberish = BigNumber.from(
			"1000000000000000000"
		)
			.mul(totalPooledMaticAfterRewards)
			.div(totalSharesAfterRewards);
		expect(rateAfterRewards).to.equal(expectedRateAfterRewards);

		await requestWithdraw(user, totalSharesAfterRewards);

		const [totalSharesAfterWithdrawAll, totalPooledMaticAfterWithdrawAll] =
			await fxStateChildTunnel.getReserves();
		const rateAfterWithdrawAll = await rateProvider.getRate();
		expect(totalSharesAfterWithdrawAll).to.equal(0);
		expect(totalPooledMaticAfterWithdrawAll).to.equal(0);
		expect(rateAfterWithdrawAll).to.equal(ethers.utils.parseEther("1"));
	});

	it("it should add and then remove a bot address", async () => {
		const botRole = await maticX.BOT();
		expect(await maticX.hasRole(botRole, users[0].address)).to.eql(false);
		const tx = await maticX.grantRole(botRole, users[0].address);
		await expect(tx)
			.to.emit(maticX, "RoleGranted")
			.withArgs(botRole, users[0].address, instantPoolOwner.address);
		expect(await maticX.hasRole(botRole, users[0].address)).to.eql(true);

		const tx2 = await maticX.revokeRole(botRole, users[0].address);
		await expect(tx2)
			.to.emit(maticX, "RoleRevoked")
			.withArgs(botRole, users[0].address, instantPoolOwner.address);
		expect(await maticX.hasRole(botRole, users[0].address)).to.eql(false);
	});

	it.skip("it should stakeRewards - accesscontrol check", async () => {
		const botRole = await maticX.BOT();
		await maticX.grantRole(botRole, users[1].address);

		const submitAmounts: string[] = [];
		const [minAmount, maxAmount] = [0.005, 0.01];
		const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;
		for (let i = 0; i < delegatorsAmount; i++) {
			submitAmounts.push(
				(Math.random() * (maxAmount - minAmount) + minAmount).toFixed(3)
			);
			const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);
			await mint(users[i], submitAmountWei);
			await submit(users[i], submitAmountWei);
		}
		const instantPoolMatic = ethers.utils.parseEther("10");
		await mint(deployer, instantPoolMatic);
		await maticApprove(deployer, instantPoolMatic);
		// await provideInstantPoolMatic(deployer, instantPoolMatic);
		const rewards = 1000000;
		const feePercent = await maticX.feePercent();
		const treasuryFee = (rewards * feePercent) / 100;
		const stakedAmount = rewards - treasuryFee;
		await polygonMock.mintTo(maticX.address, rewards);

		// fails for non-bot
		await expect(stakeRewardsAndDistributeFees(users[0], 1)).to.be.reverted;

		// succeeds for bot
		const stakeRewardsAndDistributeFeesTx =
			await stakeRewardsAndDistributeFees(users[1], 1);
		await expect(stakeRewardsAndDistributeFeesTx)
			.emit(maticX, "StakeRewards")
			.withArgs(1, stakedAmount);
		await expect(stakeRewardsAndDistributeFeesTx)
			.emit(maticX, "DistributeFees")
			.withArgs(treasury.address, treasuryFee);
	});

	it("should call the withdraw rewards on multiple validators", async () => {
		const submitAmounts: string[] = [];

		const [minAmount, maxAmount] = [0.005, 0.01];
		const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;

		for (let i = 0; i < delegatorsAmount; i++) {
			submitAmounts.push(
				(Math.random() * (maxAmount - minAmount) + minAmount).toFixed(3)
			);
			const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);
			await mint(users[i], submitAmountWei);
			await submit(users[i], submitAmountWei);
		}

		const validatorsAddress = [];
		validatorsAddress[0] = await stakeManagerMock.getValidatorContract(
			BigNumber.from(1)
		);
		validatorsAddress[1] = await stakeManagerMock.getValidatorContract(
			BigNumber.from(2)
		);
		await mintAndTransferMatic(
			deployer,
			ethers.utils.parseEther("15"),
			validatorsAddress[0]
		);
		await mintAndTransferMatic(
			deployer,
			ethers.utils.parseEther("17"),
			validatorsAddress[1]
		);
		/*
		const iFace = new ethers.utils.Interface([
			"event WithdrawRewards(uint256 indexed _validatorId, uint256 _rewards)",
		]);
		const tx1 = await maticX.withdrawRewards(BigNumber.from(1));
		const receipt = await ethers.provider.getTransactionReceipt(tx1.hash);
		console.log(
			iFace.decodeEventLog(
				"WithdrawRewards",
				receipt.logs[1].data,
				receipt.logs[1].topics
			)
		);*/

		const oldBalance = await polygonMock.balanceOf(maticX.address);
		const tx = await maticX.withdrawValidatorsReward([
			BigNumber.from(1),
			BigNumber.from(2),
		]);

		await expect(tx)
			.to.emit(maticX, "WithdrawRewards")
			.withArgs(BigNumber.from(1), ethers.utils.parseEther("15"));
		await expect(tx)
			.to.emit(maticX, "WithdrawRewards")
			.withArgs(BigNumber.from(2), ethers.utils.parseEther("17"));
		const newBalance = await polygonMock.balanceOf(maticX.address);
		expect(newBalance.sub(oldBalance)).to.eql(
			ethers.utils.parseEther("32")
		);
	});

	it("should call the withdraw rewards on multiple validators - wrong validator Id", async () => {
		const submitAmounts: string[] = [];

		const [minAmount, maxAmount] = [0.005, 0.01];
		const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;

		for (let i = 0; i < delegatorsAmount; i++) {
			submitAmounts.push(
				(Math.random() * (maxAmount - minAmount) + minAmount).toFixed(3)
			);
			const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);
			await mint(users[i], submitAmountWei);
			await submit(users[i], submitAmountWei);
		}

		const validatorsAddress = [];
		validatorsAddress[0] = await stakeManagerMock.getValidatorContract(
			BigNumber.from(1)
		);
		validatorsAddress[1] = await stakeManagerMock.getValidatorContract(
			BigNumber.from(2)
		);
		await mintAndTransferMatic(
			deployer,
			ethers.utils.parseEther("15"),
			validatorsAddress[0]
		);
		await mintAndTransferMatic(
			deployer,
			ethers.utils.parseEther("17"),
			validatorsAddress[1]
		);

		const oldBalance = await polygonMock.balanceOf(maticX.address);
		const tx = maticX.withdrawValidatorsReward([
			BigNumber.from(1),
			BigNumber.from(4),
		]);
		await expect(tx).to.be.revertedWith(
			"function call to a non-contract account"
		);
		const newBalance = await polygonMock.balanceOf(maticX.address);
		expect(newBalance.sub(oldBalance)).to.eql(BigNumber.from(0));
	});
});
