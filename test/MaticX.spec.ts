import { BigNumber, BigNumberish } from '@ethersproject/bignumber'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { Transaction } from 'ethers'
import { ethers, upgrades } from 'hardhat'
import {
  MaticX,
  PolygonMock,
  ValidatorRegistry,
  StakeManagerMock,
} from '../typechain'

describe('MaticX contract', function () {
  let deployer: SignerWithAddress
  let manager: SignerWithAddress
  let instant_pool_owner: SignerWithAddress
  let insurance: SignerWithAddress
  let treasury: SignerWithAddress
  let users: SignerWithAddress[] = []
  let maticX: MaticX
  let polygonMock: PolygonMock
  let validatorRegistry: ValidatorRegistry
  let stakeManagerMock: StakeManagerMock

  let mint: (signer: SignerWithAddress, amount: BigNumberish) => Promise<void>
  let maticApprove: (
    signer: SignerWithAddress,
    amount: BigNumberish,
  ) => Promise<void>
  let submitWithoutApprove: (
    signer: SignerWithAddress,
    amount: BigNumberish,
  ) => Promise<void>
  let submit: (
    signer: SignerWithAddress,
    amount: BigNumberish,
  ) => Promise<Transaction>
  let requestWithdraw: (
    signer: SignerWithAddress,
    amount: BigNumberish,
  ) => Promise<Transaction>
  let claimWithdrawal: (
    signer: SignerWithAddress,
    idx: BigNumberish,
  ) => Promise<Transaction>
  let migrateDelegation: (
    signer: SignerWithAddress,
    fromValidatorId: BigNumberish,
    toValidatorId: BigNumberish,
    amount: BigNumberish,
  ) => Promise<Transaction>

  before(() => {
    mint = async (signer, amount) => {
      const signerERC = polygonMock.connect(signer)
      await signerERC.mint(amount)
    }

    maticApprove = async (signer, amount) => {
      const signerERC20 = polygonMock.connect(signer)
      await signerERC20.approve(maticX.address, amount)
    }

    submitWithoutApprove = async (signer, amount) => {
      const signerMaticX = maticX.connect(signer)
      await signerMaticX.submit(amount)
    }

    submit = async (signer, amount) => {
      await maticApprove(signer, amount)

      const signerMaticX = maticX.connect(signer)
      return signerMaticX.submit(amount)
    }

    requestWithdraw = async (signer, amount) => {
      const signerMaticX = maticX.connect(signer)
      await signerMaticX.approve(maticX.address, amount)
      return signerMaticX.requestWithdraw(amount)
    }

    claimWithdrawal = async (signer, idx) => {
      const signerMaticX = maticX.connect(signer)
      return signerMaticX.claimWithdrawal(idx)
    }

    migrateDelegation = async (
      signer,
      fromValidatorId,
      toValidatorId,
      amount,
    ) => {
      const signerMaticX = maticX.connect(signer)
      return await signerMaticX.migrateDelegation(
        fromValidatorId,
        toValidatorId,
        amount,
      )
    }
  })

  beforeEach(async () => {
    ;[deployer, ...users] = await ethers.getSigners()
    manager = deployer
    treasury = deployer
    insurance = deployer
    instant_pool_owner = deployer
    polygonMock = (await (
      await ethers.getContractFactory('PolygonMock')
    ).deploy()) as PolygonMock

    await polygonMock.deployed()

    stakeManagerMock = (await (
      await ethers.getContractFactory('StakeManagerMock')
    ).deploy(polygonMock.address, polygonMock.address)) as StakeManagerMock
    await stakeManagerMock.deployed()

    validatorRegistry = (await upgrades.deployProxy(
      await ethers.getContractFactory('ValidatorRegistry'),
      [
        stakeManagerMock.address,
        polygonMock.address,
        ethers.constants.AddressZero,
        manager.address,
      ],
    )) as ValidatorRegistry
    await validatorRegistry.deployed()

    maticX = (await upgrades.deployProxy(
      await ethers.getContractFactory('MaticX'),
      [
        validatorRegistry.address,
        stakeManagerMock.address,
        polygonMock.address,
        manager.address,
        instant_pool_owner.address,
        treasury.address,
        insurance.address,
      ],
    )) as MaticX
    await maticX.deployed()

    await validatorRegistry.setMaticX(maticX.address)
    await stakeManagerMock.createValidator(1)
    await validatorRegistry.addValidator(1)
    await validatorRegistry.setPreferredDepositValidatorId(1)
    await validatorRegistry.setPreferredWithdrawalValidatorId(1)
    await stakeManagerMock.createValidator(2)
    await validatorRegistry.addValidator(2)

    await maticX.safeApprove()
  })

  it('Should submit successfully', async () => {
    const total_amount = ethers.utils.parseEther('1')
    const user = users[0]

    await mint(user, total_amount)

    const approve_amount1 = ethers.utils.parseEther('0.4')
    // Approve & Submit individually 0.4
    await maticApprove(user, approve_amount1)
    await submitWithoutApprove(user, approve_amount1)

    var userBalance = await maticX.balanceOf(user.address)
    expect(userBalance).to.equal(approve_amount1)

    // Approve & Submit individually 0.6
    const remaining_amount = ethers.utils.parseEther('0.6')
    const submitTx = await submit(user, remaining_amount)
    await expect(submitTx)
      .emit(maticX, 'Submit')
      .withArgs(user.address, remaining_amount)
    await expect(submitTx)
      .emit(maticX, 'Delegate')
      .withArgs(1, remaining_amount)

    userBalance = await maticX.balanceOf(user.address)
    expect(userBalance).to.equal(total_amount)
  })

  it('fails when submit amount is greater than signer balance', async () => {
    const user = users[0]
    var userMaticXBalance = await maticX.balanceOf(user.address)
    expect(userMaticXBalance).to.equal(0)

    const amount = ethers.utils.parseEther('1')
    await mint(user, amount)

    await expect(submitWithoutApprove(user, amount)).to.be.revertedWith(
      'ERC20: insufficient allowance',
    )

    await expect(submit(user, ethers.utils.parseEther('2'))).to.be.revertedWith(
      'ERC20: transfer amount exceeds balance',
    )

    userMaticXBalance = await maticX.balanceOf(user.address)
    expect(userMaticXBalance).to.equal(0)
  })

  it('Should request withdraw from the contract successfully', async () => {
    const amount = ethers.utils.parseEther('1')
    const user = users[0]

    await mint(user, amount)

    const submitTx = await submit(user, amount)
    await expect(submitTx).emit(maticX, 'Submit').withArgs(user.address, amount)
    await expect(submitTx).emit(maticX, 'Delegate').withArgs(1, amount)

    await expect(await requestWithdraw(user, amount))
      .emit(maticX, 'RequestWithdraw')
      .withArgs(user.address, amount, amount)

    const userBalance = await maticX.balanceOf(user.address)
    expect(userBalance).to.equal(0)
  })

  it('WithdrawalRequest should have correct share amount', async () => {
    const expectedAmount = ethers.utils.parseEther('1')
    const user = users[0]

    await mint(user, expectedAmount)

    const submitTx = await submit(user, expectedAmount)
    await expect(submitTx)
      .emit(maticX, 'Submit')
      .withArgs(user.address, expectedAmount)
    await expect(submitTx).emit(maticX, 'Delegate').withArgs(1, expectedAmount)

    await expect(await requestWithdraw(user, expectedAmount))
      .emit(maticX, 'RequestWithdraw')
      .withArgs(user.address, expectedAmount, expectedAmount)

    const amount = await maticX.getSharesAmountOfUserWithdrawalRequest(
      user.address,
      0,
    )
    expect(expectedAmount).to.equal(amount)
  })

  it('Should claim withdrawals after submitting to contract successfully', async () => {
    const submitAmounts: string[] = []
    const withdrawAmounts: string[] = []

    const [minAmount, maxAmount] = [0.005, 0.01]
    const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1

    for (let i = 0; i < delegatorsAmount; i++) {
      submitAmounts.push(
        (Math.random() * (maxAmount - minAmount) + minAmount).toFixed(3),
      )
      const submitAmountWei = ethers.utils.parseEther(submitAmounts[i])

      await mint(users[i], submitAmountWei)

      const submitTx = await submit(users[i], submitAmountWei)
      await expect(submitTx)
        .emit(maticX, 'Submit')
        .withArgs(users[i].address, submitAmountWei)
      await expect(submitTx)
        .emit(maticX, 'Delegate')
        .withArgs(1, submitAmountWei)
    }

    await stakeManagerMock.setEpoch(1)

    for (let i = 0; i < delegatorsAmount; i++) {
      withdrawAmounts.push(
        (
          Math.random() * (Number(submitAmounts[i]) - minAmount) +
          minAmount
        ).toFixed(3),
      )
      const withdrawAmountWei = ethers.utils.parseEther(withdrawAmounts[i])

      await expect(await requestWithdraw(users[i], withdrawAmountWei))
        .emit(maticX, 'RequestWithdraw')
        .withArgs(users[i].address, withdrawAmountWei, withdrawAmountWei)
    }

    const withdrawalDelay = await stakeManagerMock.withdrawalDelay()
    const currentEpoch = await stakeManagerMock.epoch()

    await stakeManagerMock.setEpoch(withdrawalDelay.add(currentEpoch))

    for (let i = 0; i < delegatorsAmount; i++) {
      await expect(await claimWithdrawal(users[i], 0))
        .emit(maticX, 'ClaimWithdrawal')
        .withArgs(
          users[i].address,
          0,
          ethers.utils.parseEther(withdrawAmounts[i]),
        )
      const balanceAfter = await polygonMock.balanceOf(users[i].address)

      expect(balanceAfter).to.equal(ethers.utils.parseEther(withdrawAmounts[i]))
    }
  })

  it('Should restake all validator rewards successfully', async () => {
    const submitAmounts: string[] = []

    const [minAmount, maxAmount] = [0.005, 0.01]
    const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1

    for (let i = 0; i < delegatorsAmount; i++) {
      submitAmounts.push(
        (Math.random() * (maxAmount - minAmount) + minAmount).toFixed(3),
      )
      const submitAmountWei = ethers.utils.parseEther(submitAmounts[i])

      await mint(users[i], submitAmountWei)
      await submit(users[i], submitAmountWei)
    }

    expect(await maticX.restakeAll())
      .emit(maticX, 'RestakeEvent')
      .withArgs(manager, 1, 0, 0)
  })

  it('Should restake a validator reward successfully', async () => {
    const submitAmounts: string[] = []

    const [minAmount, maxAmount] = [0.005, 0.01]
    const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1

    for (let i = 0; i < delegatorsAmount; i++) {
      submitAmounts.push(
        (Math.random() * (maxAmount - minAmount) + minAmount).toFixed(3),
      )
      const submitAmountWei = ethers.utils.parseEther(submitAmounts[i])

      await mint(users[i], submitAmountWei)
      await submit(users[i], submitAmountWei)
    }

    expect(await maticX.restake(1))
      .emit(maticX, 'RestakeEvent')
      .withArgs(manager, 1, 0, 0)
  })

  it('Should migrate validator stake to another validator successfully', async () => {
    const user = users[0]

    await mint(user, 100)
    await submit(user, 100)

    await stakeManagerMock.createValidator(123)
    await validatorRegistry.addValidator(123)

    await expect(await migrateDelegation(manager, 1, 123, 100))
      .emit(maticX, 'MigrateDelegation')
      .withArgs(1, 123, 100)
  })
})
