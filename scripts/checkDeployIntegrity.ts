import hardhat, { ethers } from 'hardhat'
import { ValidatorRegistry, MaticX } from '../typechain'
import { getUpgradeContext } from './utils'

const checkDeployIntegrity = async () => {
  const { deployDetails } = getUpgradeContext(hardhat)
  const validatorRegistry: ValidatorRegistry = (await ethers.getContractAt(
    'ValidatorRegistry',
    deployDetails.validator_registry_proxy,
  )) as ValidatorRegistry

  const maticX: MaticX = (await ethers.getContractAt(
    'MaticX',
    deployDetails.maticX_proxy,
  )) as MaticX

  console.log('Checking contracts integrity...')

  const res = await validatorRegistry.getContracts()
  isValid(
    res._polygonERC20,
    deployDetails.matic_erc20_address,
    'ValidatorRegistry',
    'ERC20',
  )
  isValid(
    res._maticX,
    deployDetails.maticX_proxy,
    'ValidatorRegistry',
    'MaticX',
  )
  isValid(
    res._stakeManager,
    deployDetails.matic_stake_manager_proxy,
    'ValidatorRegistry',
    'StakeManager',
  )

  isValid(
    await maticX.validatorRegistry(),
    deployDetails.validator_registry_proxy,
    'maticX',
    'validatorRegistry',
  )
  isValid(
    await maticX.token(),
    deployDetails.matic_erc20_address,
    'maticX',
    'matic_erc20_address',
  )

  console.log('All is Good :)')
}

const isValid = (
  actual: string,
  target: string,
  contract: string,
  message: string,
) => {
  if (actual.toLowerCase() !== target.toLowerCase()) {
    console.log('actual:', actual)
    console.log('target:', target)
    throw new Error(`Error: ${contract}--Invalid address--${message}`)
  }
}

checkDeployIntegrity()
