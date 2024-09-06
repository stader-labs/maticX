# MaticX

Before deploying check out the `.env.test.example` file. You should create your own `.env.test` file.

```bash
DEPLOYER_PRIVATE_KEY=<PRIVATE KEY OF THE DEPLOYER WALLET>
ETHERSCAN_API_KEY=<ETHERSCAN API KEY>
ROOT_CHAIN_RPC=<RPC OF THE ROOT CHAIN>
ROOT_GAS_PRICE=<GAS PRICE IN WEI>
CHILD_CHAIN_RPC=<RPC OF THE CHILD CHAIN>
CHILD_GAS_PRICE=<GAS PRICE IN WEI>
STAKE_MANAGER=<STAKE MANAGER ADDRESS (POLYGON FOUNDATION)>
MATIC_TOKEN=<ADDRESS OF THE MATIC ERC20 TOKEN>
MANAGER=<ADDRESS THAT WILL BE USED AS A MANAGER>
TREASURY=<ADDRESS THAT WILL BE USED AS A TREASURY FOR REVENUE COLLECTION>
FX_ROOT=<FX ROOT ADDRESS ON ETHEREUM (POLYGON FOUNDATION)>
FX_CHILD=<FX CHILD ADDRESS ON POLYGON (POLYGON FOUNDATION)>
CHECKPOINT_MANAGER=<CHECKPOINT MANAGER ADDRESS ON ETHEREUM (POLYGON FOUNDATION)>
```

# Deploying

To deploy on testnet run:

```bash
npm run deploy:test
```

To deploy on mainnet run:

```bash
npm run deploy:main
```

To deploy contract directly, run:

```bash
npx hardhat deployFxStateChildTunnel --network matic
npx hardhat deployRateProvider <fxStateChildTunnelAddress> --network matic
npx hardhat deployChildPoolImpl --network matic
npx hardhat deployChildPoolProxy <fxStateChildTunnelAddress> <maticX> <manager> <instantPoolOwner> <treasury> <instantWithdrawalFeeBps> --network matic
npx hardhat deployFxStateRootTunnel <maticXAddress> --network mainnet
npx hardhat deployMaticXImpl --network mainnet
npx hardhat deployValidatorRegistryImpl --network mainnet
```

# Upgrading

```bash
npx hardhat run ./scripts/upgradeMaticX.ts --network <network>
npx hardhat run ./scripts/upgradeValidatorRegistry.ts --network <network>
```

# Verifying on etherscan

```bash
npx hardhat verifyMaticX --network <network>
npx hardhat verify <address> <...args> --network <network>
```

# Testing

```bash
npx hardhat test
```

## Integration

Smart contract integration guide is at [link](INTEGRATION.md)
