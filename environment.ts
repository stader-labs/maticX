import * as dotenv from 'dotenv'
import * as path from 'path'

import { ethers } from 'ethers'

const envSuffix = process.env.NODE_ENV === 'main' ? '' : '.test'

dotenv.config({ path: path.join(__dirname, '.env' + envSuffix) })

const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY || ethers.Wallet.createRandom().privateKey
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || ''
const VALIDATOR_PRIVATE_KEY = process.env.VALIDATOR_PRIVATE_KEY || ''
const ROOT_CHAIN_RPC = process.env.ROOT_CHAIN_RPC || ''
const STAKE_MANAGER = process.env.STAKE_MANAGER || ''
const MATIC_TOKEN = process.env.MATIC_TOKEN || ''
const MANAGER = process.env.MANAGER || ''
const INSURANCE = process.env.INSURANCE || ''
const TREASURY = process.env.TREASURY || ''
const ROOT_GAS_PRICE = process.env.ROOT_GAS_PRICE || 0
const ROOT_GAS_LIMIT = process.env.ROOT_GAS_LIMIT || 0
const DEFENDER_TEAM_API_KEY = process.env.DEFENDER_TEAM_API_KEY || ''
const DEFENDER_TEAM_API_SECRET_KEY =
  process.env.DEFENDER_TEAM_API_SECRET_KEY || ''

export {
  DEPLOYER_PRIVATE_KEY,
  ETHERSCAN_API_KEY,
  VALIDATOR_PRIVATE_KEY,
  ROOT_CHAIN_RPC,
  STAKE_MANAGER,
  MATIC_TOKEN,
  MANAGER,
  INSURANCE,
  TREASURY,
  ROOT_GAS_PRICE,
  ROOT_GAS_LIMIT,
  DEFENDER_TEAM_API_KEY,
  DEFENDER_TEAM_API_SECRET_KEY,
}
