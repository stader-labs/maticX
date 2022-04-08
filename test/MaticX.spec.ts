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
  let submit: (signer: SignerWithAddress, amount: BigNumberish) => Promise<void>
  let requestWithdraw: (
    signer: SignerWithAddress,
    amount: BigNumberish,
  ) => Promise<void>
  let claimWithdrawal: (
    signer: SignerWithAddress,
    idx: BigNumberish,
  ) => Promise<void>
  let migrateDelegation: (
    signer: SignerWithAddress,
    fromValidatorId: BigNumberish,
    toValidatorId: BigNumberish,
    amount: BigNumberish,
  ) => Promise<Transaction>
  let setCapAmount: (
    signer: SignerWithAddress,
    amount: BigNumberish,
  ) => Promise<void>

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
      await signerMaticX.submit(amount)
    }

    requestWithdraw = async (signer, amount) => {
      const signerMaticX = maticX.connect(signer)
      await signerMaticX.approve(maticX.address, amount)
      await signerMaticX.requestWithdraw(amount)
    }

    claimWithdrawal = async (signer, idx) => {
      const signerMaticX = maticX.connect(signer)
      await signerMaticX.claimWithdrawal(idx)
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

    setCapAmount = async (signer, amount) => {
      const signerMaticX = maticX.connect(signer)
      await signerMaticX.setCapAmount(amount)
    }
  })

  beforeEach(async () => {
    const capAmount = ethers.utils.parseEther('1000')

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
        capAmount,
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
    await mint(users[0], total_amount)

    const approve_amount1 = ethers.utils.parseEther('0.4')
    // Approve & Submit individually 0.4
    await maticApprove(users[0], approve_amount1)
    await submitWithoutApprove(users[0], approve_amount1)

    var userBalance = await maticX.balanceOf(users[0].address)
    expect(userBalance.eq(approve_amount1)).to.be.true

    // Approve & Submit individually 0.6
    const remaining_amount = ethers.utils.parseEther('0.6')
    await submit(users[0], remaining_amount)

    userBalance = await maticX.balanceOf(users[0].address)
    expect(userBalance.eq(total_amount)).to.be.true
  })

  it('fails when submit amount is greater than signer balance', async () => {
    var userMaticXBalance = await maticX.balanceOf(users[0].address)
    expect(userMaticXBalance.eq(0)).to.be.true

    const amount = ethers.utils.parseEther('1')
    await mint(users[0], amount)

    await expect(submitWithoutApprove(users[0], amount)).to.be.revertedWith(
      'ERC20: insufficient allowance',
    )

    await expect(
      submit(users[0], ethers.utils.parseEther('2')),
    ).to.be.revertedWith('ERC20: transfer amount exceeds balance')

    userMaticXBalance = await maticX.balanceOf(users[0].address)
    expect(userMaticXBalance.eq(0)).to.be.true
  })

  it('Should request withdraw from the contract successfully', async () => {
    const amount = ethers.utils.parseEther('1')
    await mint(users[0], amount)
    await submit(users[0], amount)
    await requestWithdraw(users[0], amount)

    const userBalance = await maticX.balanceOf(users[0].address)
    expect(userBalance).to.equal(0)
  })

  it('WithdrawalRequest should have correct share amount', async () => {
    const expectedAmount = ethers.utils.parseEther('1')
    await mint(users[0], expectedAmount)
    await submit(users[0], expectedAmount)
    await requestWithdraw(users[0], expectedAmount)

    const amount = await maticX.getSharesAmountOfUserWithdrawalRequest(
      users[0].address,
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
      await submit(users[i], submitAmountWei)
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

      await requestWithdraw(users[i], withdrawAmountWei)
    }

    const withdrawalDelay = await stakeManagerMock.withdrawalDelay()
    const currentEpoch = await stakeManagerMock.epoch()

    await stakeManagerMock.setEpoch(withdrawalDelay.add(currentEpoch))

    for (let i = 0; i < delegatorsAmount; i++) {
      await claimWithdrawal(users[i], 0)
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
    await mint(users[0], 100)
    await submit(users[0], 100)

    await stakeManagerMock.createValidator(123)
    await validatorRegistry.addValidator(123)

    await expect(await migrateDelegation(manager, 1, 123, 100))
      .emit(maticX, 'MigrateDelegation')
      .withArgs(1, 123, 100)
  })

  it('Should fail when amount exceeds cap limit', async () => {
    await mint(users[0], ethers.utils.parseEther('1001'))
    await expect(
      submit(users[0], ethers.utils.parseEther('1001')),
    ).to.be.revertedWith('Exceeds cap limit')

    await setCapAmount(manager, ethers.utils.parseEther('1001'))
    await submit(users[0], ethers.utils.parseEther('1001'))

    var userBalance = await maticX.balanceOf(users[0].address)
    expect(userBalance).to.equal(ethers.utils.parseEther('1001'))
  })
})
