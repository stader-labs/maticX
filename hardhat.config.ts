import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { HardhatUserConfig, task } from 'hardhat/config'

import 'hardhat-contract-sizer'
import 'hardhat-gas-reporter'
import '@typechain/hardhat'
import '@nomiclabs/hardhat-waffle'
import '@nomiclabs/hardhat-ethers'
import '@openzeppelin/hardhat-upgrades'
import '@nomiclabs/hardhat-etherscan'
import '@openzeppelin/hardhat-defender'

import { deployDirect, verify } from './scripts/tasks'

import {
  DEPLOYER_PRIVATE_KEY,
  ETHERSCAN_API_KEY,
  ROOT_CHAIN_RPC,
  ROOT_GAS_PRICE,
  DEFENDER_TEAM_API_KEY,
  DEFENDER_TEAM_API_SECRET_KEY,
  CHILD_CHAIN_RPC,
  CHILD_GAS_PRICE,
} from './environment'

task('verifyMaticX', 'MaticX contracts verification').setAction(
  async (args, hre: HardhatRuntimeEnvironment) => {
    await verify(hre)
  },
)

task("deployFxStateChildTunnel", "Deploy FxStateChildTunnel")
  .addPositionalParam("fxChild")
  .setAction(async ({fxChild}, hre: HardhatRuntimeEnvironment) => {
    await deployDirect(hre, "FxStateChildTunnel", fxChild)
  }
);

task("deployFxStateRootTunnel", "Deploy FxStateRootTunnel")
  .addPositionalParam("checkpointManager")
  .addPositionalParam("fxRoot")
  .addPositionalParam("maticX")
  .setAction(async ({checkpointManager, fxRoot, maticX}, hre: HardhatRuntimeEnvironment) => {
    await deployDirect(hre, "FxStateRootTunnel", checkpointManager, fxRoot, maticX)
  }
);

task("deployRateProvider", "Deploy RateProvider")
  .addPositionalParam("fxChild")
  .setAction(async ({fxChild}, hre: HardhatRuntimeEnvironment) => {
    await deployDirect(hre, "RateProvider", fxChild)
  }
);

task("deployMaticXImpl", "Deploy MaticX Implementation only")
  .setAction(async (args, hre: HardhatRuntimeEnvironment) => {
    await deployDirect(hre, "MaticX")
  }
);

task("deployValidatorRegistryImpl", "Deploy ValidatorRegistry Implementation only")
  .setAction(async (args, hre: HardhatRuntimeEnvironment) => {
    await deployDirect(hre, "ValidatorRegistry")
  }
);

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  solidity: {
    version: '0.8.7',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
    testnet: {
      url: ROOT_CHAIN_RPC,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gasPrice: Number(ROOT_GAS_PRICE),
    },
    mainnet: {
      url: ROOT_CHAIN_RPC,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gasPrice: Number(ROOT_GAS_PRICE),
    },
    matic: {
      url: CHILD_CHAIN_RPC,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gasPrice: Number(CHILD_GAS_PRICE),
    },
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5',
  },
  mocha: {
    timeout: 99999999,
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  defender: {
    apiKey: DEFENDER_TEAM_API_KEY,
    apiSecret: DEFENDER_TEAM_API_SECRET_KEY,
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
  },
  gasReporter: {
    currency: 'USD',
    gasPrice: 50,
  },
}

export default config
