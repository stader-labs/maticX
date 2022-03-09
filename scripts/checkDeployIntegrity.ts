import hardhat, { ethers } from 'hardhat'
import { NodeOperatorRegistry, MaticX } from '../typechain'
import { getUpgradeContext } from './utils'

const checkDeployIntegrity = async () => {
  const { deployDetails } = getUpgradeContext(hardhat)
  const nodeOperatorRegistry: NodeOperatorRegistry = (await ethers.getContractAt(
    'NodeOperatorRegistry',
    deployDetails.node_operator_registry_proxy,
  )) as NodeOperatorRegistry

  const maticX: MaticX = (await ethers.getContractAt(
    'MaticX',
    deployDetails.maticX_proxy,
  )) as MaticX

  console.log('Checking contracts integrity...')

  const res = await nodeOperatorRegistry.getContracts()
  isValid(
    res._polygonERC20,
    deployDetails.matic_erc20_address,
    'NodeOperatorRegistry',
    'ERC20',
  )
  isValid(
    res._maticX,
    deployDetails.maticX_proxy,
    'NodeOperatorRegistry',
    'MaticX',
  )
  isValid(
    res._stakeManager,
    deployDetails.matic_stake_manager_proxy,
    'NodeOperatorRegistry',
    'StakeManager',
  )

  isValid(
    await maticX.nodeOperatorRegistry(),
    deployDetails.node_operator_registry_proxy,
    'maticX',
    'nodeOperatorRegistry',
  )
  isValid(
    await maticX.token(),
    deployDetails.matic_erc20_address,
    'maticX',
    'matic_erc20_address',
  )
  isValid(await maticX.dao(), deployDetails.dao, 'maticX', 'dao')
  isValid(
    await maticX.insurance(),
    deployDetails.treasury,
    'maticX',
    'treasury',
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
