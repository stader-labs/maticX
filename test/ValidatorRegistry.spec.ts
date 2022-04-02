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

describe('ValidatorRegistry contract', function () {
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

  let addValidator: (
    signer: SignerWithAddress,
    validartorId: BigNumberish,
  ) => Promise<void>
  let removeValidator: (
    signer: SignerWithAddress,
    validartorId: BigNumberish,
  ) => Promise<void>
  let createValidator: (
    signer: SignerWithAddress,
    validartorId: BigNumberish,
  ) => Promise<void>
  let getValidators: () => Promise<BigNumber[]>
  let getValidatorContract: (validatorId: BigNumberish) => Promise<string>

  before(() => {
    addValidator = async (signer, validatorId) => {
      const signerValidatorRegistry = validatorRegistry.connect(signer)
      await signerValidatorRegistry.addValidator(validatorId)
    }

    removeValidator = async (signer, validatorId) => {
      const signerValidatorRegistry = validatorRegistry.connect(signer)
      await signerValidatorRegistry.removeValidator(validatorId)
    }

    createValidator = async (signer, validatorId) => {
      const signerStakeManagerMock = stakeManagerMock.connect(signer)
      await signerStakeManagerMock.createValidator(validatorId)
    }

    getValidators = async () => {
      const validators = validatorRegistry.getValidators()
      return validators
    }

    getValidatorContract = async (validatorId) => {
      const contractAddress = stakeManagerMock.getValidatorContract(validatorId)
      return contractAddress
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
        instant_pool_owner.address,
        manager.address,
        treasury.address,
        insurance.address,
      ],
    )) as MaticX
    await maticX.deployed()

    await validatorRegistry.setMaticX(maticX.address)
    await maticX.safeApprove()
  })

  it('It should add new operators', async function () {
    const validatorIds = [3, 6]

    for (const id of validatorIds) {
      await createValidator(manager, id)
      const constractAddress = await getValidatorContract(id)
      expect(constractAddress).to.be.properAddress
    }

    const expectedValidators = []
    const validators = await getValidators()
    expect(validators).to.be.empty
    for (const id of validatorIds) {
      await addValidator(manager, id)
      expectedValidators.push(BigNumber.from(id))
      const validators = await getValidators()
      expect(validators).to.eql(expectedValidators)
    }
  })

  it('It should remove operators', async function () {
    const validatorIds = [3, 6]
    const expectedValidators = []
    for (const id of validatorIds) {
      await createValidator(manager, id)
      await addValidator(manager, id)
      expectedValidators.push(BigNumber.from(id))
    }

    const validators = await getValidators()
    expect(validators).to.eql(expectedValidators)
    for (const id of validatorIds) {
      await removeValidator(manager, id)
      expectedValidators.splice(0, 1)
      const validators = await getValidators()
      expect(validators).to.eql(expectedValidators)
    }
  })
})