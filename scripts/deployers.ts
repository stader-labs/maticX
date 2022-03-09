import * as fs from 'fs'
import { Contract, Wallet } from 'ethers'
import { ethers, network, upgrades } from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

import { predictContractAddress } from './utils'
import { NodeOperatorRegistry, MaticX } from '../typechain'
import { STAKE_MANAGER, MATIC_TOKEN, DAO, INSURANCE } from '../environment'
import path from 'path'

type DeploymentData = {
  Network: string
  Signer: string
  Dao: string
  MaticX: string
  NodeOperatorRegistry: string
}

type ContractNames =
  | 'ProxyAdmin'
  | 'NodeOperatorRegistryImplementation'
  | 'NodeOperatorRegistry'
  | 'MaticXImplementation'
  | 'MaticX'

type RootContractNames = ContractNames
type RootDeploymentOrder = Record<RootContractNames, number>

const rootDeploymentOrder: RootDeploymentOrder = {
  ProxyAdmin: 0,
  NodeOperatorRegistryImplementation: 1,
  NodeOperatorRegistry: 2,
  MaticXImplementation: 3,
  MaticX: 4,
}

interface Exportable {
  data: Record<any, string>
  export(): void
}

interface Deployable {
  deploy(): void
}

class BlockchainDeployer {
  signer: Wallet | SignerWithAddress
  nonce: number

  constructor(signer: Wallet | SignerWithAddress, nonce: number) {
    this.signer = signer
    this.nonce = nonce
  }

  deployContract = async <T extends Contract>(
    contractName: keyof DeploymentData,
    ...args: any[]
  ) => {
    console.log(`Deploying ${contractName}: ${args}, ${args.length}`)
    const Contract = await ethers.getContractFactory(contractName, this.signer)
    const contract = args.length
      ? ((await Contract.deploy(...args)) as T)
      : ((await Contract.deploy()) as T)
    await contract.deployed()
    console.log(`Deployed at ${contract.address}`)

    return contract
  }

  deployProxy = async <T extends Contract>(
    contractName: keyof DeploymentData,
    ...args: any[]
  ) => {
    console.log(`Deploying ${contractName}: ${args}, ${args.length}`)
    const Contract = await ethers.getContractFactory(contractName, this.signer)
    const contract = args.length
      ? ((await upgrades.deployProxy(Contract, args)) as T)
      : ((await upgrades.deployProxy(Contract)) as T)
    await contract.deployed()
    console.log(`Deployed at ${contract.address}`)

    return contract
  }
}

abstract class MultichainDeployer {
  rootDeployer: BlockchainDeployer

  constructor(rootDeployer: BlockchainDeployer) {
    this.rootDeployer = rootDeployer
  }
}

export class MaticXDeployer extends MultichainDeployer
  implements Exportable, Deployable {
  data: Partial<Record<ContractNames, string>> = {}

  public static CreateMaticXDeployer = async (
    rootSigner: Wallet | SignerWithAddress,
  ) => {
    const rootNonce = await rootSigner.getTransactionCount()
    const rootDeployer = new BlockchainDeployer(rootSigner, rootNonce)
    const maticXDeployer = new MaticXDeployer(rootDeployer)

    maticXDeployer.predictAddresses()

    return maticXDeployer
  }

  deploy = async () => {
    await this.deployNodeOperatorRegistry()
    await this.deployMaticX()
  }

  private checkAddress = (expected: string, computed: string) => {
    if (expected.toLowerCase() !== computed.toLowerCase()) {
      throw new Error(
        `Invalid address: expected ==> ${expected} || computed ==> ${computed}`,
      )
    }
  }

  private deployNodeOperatorRegistry = async () => {
    return this.rootDeployer.deployProxy<NodeOperatorRegistry>(
      'NodeOperatorRegistry',
      STAKE_MANAGER,
      MATIC_TOKEN,
      this.data.MaticX,
    )
  }

  private deployMaticX = async () => {
    return this.rootDeployer.deployProxy<MaticX>(
      'MaticX',
      this.data.NodeOperatorRegistry,
      MATIC_TOKEN,
      DAO,
      INSURANCE,
    )
  }

  export = async () => {
    const fileName = path.join(
      __dirname,
      '../',
      `${network.name}-deployment-info.json`,
    )
    const chainId = await this.rootDeployer.signer.getChainId()
    const out = {
      network: chainId,
      multisig_upgrader: { address: '0x', owners: [] },
      root_deployer: this.rootDeployer.signer.address,
      dao: DAO,
      treasury: INSURANCE,
      matic_erc20_address: MATIC_TOKEN,
      matic_stake_manager_proxy: STAKE_MANAGER,
      proxy_admin: this.data.ProxyAdmin,
      maticX_proxy: this.data.MaticX,
      maticX_impl: this.data.MaticXImplementation,
      node_operator_registry_proxy: this.data.NodeOperatorRegistry,
      node_operator_registry_impl: this.data.NodeOperatorRegistryImplementation,
    }
    fs.writeFileSync(fileName, JSON.stringify(out))
  }

  private predictAddresses = () => {
    this.calculateRootContractAddresses()
  }

  private calculateRootContractAddresses = () => {
    ;(Object.keys(rootDeploymentOrder) as Array<RootContractNames>).forEach(
      (k) => {
        this.data[k] = predictContractAddress(
          this.rootDeployer.signer.address,
          this.rootDeployer.nonce + rootDeploymentOrder[k],
        )
      },
    )
  }
}
