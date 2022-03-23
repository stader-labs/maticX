# MaticX

Before deploying check out the `.env.test.example` file. You should create your own `.env.test` file.

```bash
DEPLOYER_PRIVATE_KEY=<PRIVATE KEY OF THE DEPLOYER WALLET>
ETHERSCAN_API_KEY=<ETHERSCAN API KEY>
ROOT_CHAIN_RPC=<RPC OF THE ROOTH CHAIN>
ROOT_GAS_PRICE=<GAS PRICE IN WEI>
STAKE_MANAGER=<STAKE MANAGER ADDRESS>
MATIC_TOKEN=<ADDRESS OF THE MATIC ERC20 TOKEN>
DAO=<ADDRESS THAT WILL BE USED AS A DAO ON STMATIC>
INSURANCE=<ADDRESS THAT WILL BE USED AS AN INSURANCE ON STMATIC>
TREASURY=<ADDRESS THAT WILL BE USED AS A TREASURY ON STMATIC>
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

# Upgrading

To upgrade on testnet run:

```bash
npx hardhat ./scripts/upgradeMaticX.ts --network testnet
npx hardhat ./scripts/upgradeValidatorRegistry.ts --network testnet
```

To upgrade on mainnet run:

```bash
npx hardhat ./scripts/upgradeMaticX.ts --network mainnet
npx hardhat ./scripts/upgradeValidatorRegistry.ts --network mainnet
```

# Testing

```bash
npx hardhat test
```