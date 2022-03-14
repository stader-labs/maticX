import { HardhatRuntimeEnvironment } from 'hardhat/types'

import * as GOERLI_DEPLOYMENT_DETAILS from '../testnet-deployment-info.json'

const verifyContract = async (
  hre: HardhatRuntimeEnvironment,
  contractAddress: string,
) => {
  await hre.run('verify:verify', {
    address: contractAddress,
  })
}

export const verify = async (hre: HardhatRuntimeEnvironment) => {
  const contracts = [
    GOERLI_DEPLOYMENT_DETAILS.maticX_impl,
    GOERLI_DEPLOYMENT_DETAILS.validator_registry_impl,
  ]

  for (const contract of contracts) {
    await verifyContract(hre, contract)
  }
}
