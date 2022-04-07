import hardhat, { ethers, upgrades } from 'hardhat'
import { MaticX__factory } from '../typechain'
import { exportAddresses, getUpgradeContext } from './utils'

const upgradeMaticX = async () => {
  const { network, filePath, deployDetails } = getUpgradeContext(hardhat)

  console.log('Start upgrade contracts on:', network)
  const MaticXAddress = deployDetails.maticX_proxy
  const MaticXFactory: MaticX__factory = (await ethers.getContractFactory(
    'MaticX',
  )) as MaticX__factory

  await upgrades.upgradeProxy(MaticXAddress, MaticXFactory)
  const MaticXImplAddress = await upgrades.erc1967.getImplementationAddress(
    MaticXAddress,
  )

  console.log('MaticX upgraded')
  console.log('proxy:', MaticXAddress)
  console.log('Implementation:', MaticXImplAddress)

  exportAddresses(filePath, {
    maticX_proxy: MaticXAddress,
    maticX_impl: MaticXImplAddress,
  })
}

upgradeMaticX()
