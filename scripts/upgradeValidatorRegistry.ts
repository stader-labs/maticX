import hardhat, { ethers, upgrades } from 'hardhat'
import { ValidatorRegistry__factory } from '../typechain'
import { exportAddresses, getUpgradeContext } from './utils'

const upgradeValidatorRegistry = async () => {
  const { network, filePath, deployDetails } = getUpgradeContext(hardhat)

  console.log('Start upgrade contract on:', network)
  const validatorRegistryAddress = deployDetails.validator_registry_proxy
  const validatorRegistryFactory: ValidatorRegistry__factory = (await ethers.getContractFactory(
    'ValidatorRegistry',
  )) as ValidatorRegistry__factory

  await upgrades.upgradeProxy(
    validatorRegistryAddress,
    validatorRegistryFactory,
  )
  const validatorRegistryImplAddress = await upgrades.erc1967.getImplementationAddress(
    validatorRegistryAddress,
  )
  console.log('ValidatorRegistry upgraded')
  console.log('proxy:', validatorRegistryAddress)
  console.log('Implementation:', validatorRegistryImplAddress)

  exportAddresses(filePath, {
    validator_registry_proxy: validatorRegistryAddress,
    validator_registry_impl: validatorRegistryImplAddress,
  })
}

upgradeValidatorRegistry()
