interface Multisig {
  address: string
  owners: Array<string>
}

export interface DeployDetails {
  network: string
  signer: string
  multisig_upgrader: Multisig
  dao: string
  treasury: string
  matic_erc20_address: string
  matic_stake_manager_proxy: string
  maticX_proxy: string
  maticX_implementation: string
  validator_registry_proxy: string
  validator_registry_implementation: string
  default?: string
}
