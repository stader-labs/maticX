import { BigNumber, BigNumberish } from '@ethersproject/bignumber'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
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
  let insurance: SignerWithAddress
  let treasury: SignerWithAddress
  let users: SignerWithAddress[] = []
  let maticX: MaticX
  let polygonMock: PolygonMock
  let validatorRegistry: ValidatorRegistry
  let stakeManagerMock: StakeManagerMock

  let mint: (signer: SignerWithAddress, amount: BigNumberish) => Promise<void>
  let submit: (signer: SignerWithAddress, amount: BigNumberish) => Promise<void>
  let requestWithdraw: (
    signer: SignerWithAddress,
    amount: BigNumberish,
  ) => Promise<void>
  let claimWithdrawal: (
    signer: SignerWithAddress,
    idx: BigNumberish,
  ) => Promise<void>

  before(() => {
    mint = async (signer, amount) => {
      const signerERC = polygonMock.connect(signer)
      await signerERC.mint(amount)
    }

    submit = async (signer, amount) => {
      const signerERC20 = polygonMock.connect(signer)
      await signerERC20.approve(maticX.address, amount)

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
  })

  beforeEach(async () => {
    ;[deployer, ...users] = await ethers.getSigners()
    manager = deployer
    treasury = deployer
    insurance = deployer

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
        treasury.address,
        insurance.address,
      ],
    )) as MaticX
    await maticX.deployed()

    await validatorRegistry.setMaticX(maticX.address)
    await stakeManagerMock.createValidator(1)
    await validatorRegistry.addValidator(1)
    await validatorRegistry.setPreferredValidatorId(1)
    await maticX.safeApprove()
  })

  it('Should submit successfully', async () => {
    const amount = ethers.utils.parseEther('1')
    await mint(users[0], amount)
    await submit(users[0], amount)

    const userBalance = await maticX.balanceOf(users[0].address)
    expect(userBalance).to.equal(amount)
  })

  it('Should request withdraw from the contract successfully', async () => {
    const amount = ethers.utils.parseEther('1')
    await mint(users[0], amount)
    await submit(users[0], amount)
    await requestWithdraw(users[0], amount)

    const userBalance = await maticX.balanceOf(users[0].address)
    expect(userBalance).to.equal(0)
  })

  it('WithdrawalRequest should have correct MATIC token amount', async () => {
    const expectedAmount = ethers.utils.parseEther('1')
    await mint(users[0], expectedAmount)
    await submit(users[0], expectedAmount)
    await requestWithdraw(users[0], expectedAmount)

    const amount = await maticX.getMaticAmountOfUserWithdrawalRequest(
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
})
