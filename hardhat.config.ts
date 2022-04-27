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

import { deployDirect, deployProxy, verify } from './scripts/tasks'

import {
  DEPLOYER_PRIVATE_KEY,
  ETHERSCAN_API_KEY,
  ROOT_CHAIN_RPC,
  ROOT_GAS_PRICE,
  DEFENDER_TEAM_API_KEY,
  DEFENDER_TEAM_API_SECRET_KEY,
  CHILD_CHAIN_RPC,
  CHILD_GAS_PRICE,
  FX_ROOT,
  FX_CHILD,
  CHECKPOINT_MANAGER,
} from './environment'

task('verifyMaticX', 'MaticX contracts verification').setAction(
  async (args, hre: HardhatRuntimeEnvironment) => {
    await verify(hre)
  },
)

task("deployFxStateChildTunnel", "Deploy FxStateChildTunnel")
  .setAction(async (args, hre: HardhatRuntimeEnvironment) => {
    if (!isChildNetwork(hre.network.name)) return
    await deployDirect(hre, "FxStateChildTunnel", FX_CHILD)
  }
);

task("deployFxStateRootTunnel", "Deploy FxStateRootTunnel")
  .addPositionalParam("maticX")
  .setAction(async ({maticX}, hre: HardhatRuntimeEnvironment) => {
    if (!isRootNetwork(hre.network.name)) return
    await deployDirect(hre, "FxStateRootTunnel", CHECKPOINT_MANAGER, FX_ROOT, maticX)
  }
);

task("deployRateProvider", "Deploy RateProvider")
  .addPositionalParam("fxStateChildTunnel")
  .setAction(async ({fxStateChildTunnel}, hre: HardhatRuntimeEnvironment) => {
    if (!isChildNetwork(hre.network.name)) return
    await deployDirect(hre, "RateProvider", fxStateChildTunnel)
  }
);

task("deployMaticXImpl", "Deploy MaticX Implementation only")
  .setAction(async (args, hre: HardhatRuntimeEnvironment) => {
    if (!isRootNetwork(hre.network.name)) return
    await deployDirect(hre, "MaticX")
  }
);

task("deployValidatorRegistryImpl", "Deploy ValidatorRegistry Implementation only")
  .setAction(async (args, hre: HardhatRuntimeEnvironment) => {
    if (!isRootNetwork(hre.network.name)) return
    await deployDirect(hre, "ValidatorRegistry")
  }
);

task("deployChildPoolProxy", "Deploy ChildPool Proxy only")
  .addPositionalParam("fxStateChildTunnel")
  .addPositionalParam("maticX")
  .addPositionalParam("polygonErc20")
  .addPositionalParam("manager")
  .addPositionalParam("instantPoolOwner")
  .addPositionalParam("instantWithdrawalFeeBps")
  .setAction(async ({fxStateChildTunnel, maticX, polygonErc20, manager, instantPoolOwner, instantWithdrawalFeeBps}, hre: HardhatRuntimeEnvironment) => {
    if (!isChildNetwork(hre.network.name)) return
    await deployProxy(hre, "ChildPool", fxStateChildTunnel, maticX, polygonErc20, manager, instantPoolOwner, instantWithdrawalFeeBps)
  }
);

task("deployChildPoolImpl", "Deploy ChildPool Implementation only")
  .setAction(async (args, hre: HardhatRuntimeEnvironment) => {
    if (!isChildNetwork(hre.network.name)) return
    await deployDirect(hre, "ChildPool")
  }
);

function isChildNetwork(selected: string) {
  const expected = 'matic';
  return _isCorrectNetwork(expected, selected);
}

function isRootNetwork(selected: string) {
  const expected = 'mainnet';
  return _isCorrectNetwork(expected, selected);
}

function _isCorrectNetwork(expected: string, selected: string) {
  if (selected === expected) return true;

  console.log(`Wrong network configuration! Expected: ${expected} Selected: ${selected}`)
}

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
