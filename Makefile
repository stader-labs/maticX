# Binaries
BIN_HARDHAT := ./node_modules/.bin/hardhat
BIN_ECHIDNA := echidna
BIN_MYTH := myth

# Configs
CONFIG_ECHIDNA := echidna.config.yaml
CONFIG_SOLC := solc.json

# Networks
NETWORK_HARDHAT := hardhat
NETWORK_LOCALHOST := localhost
NETWORK_SEPOLIA := sepolia
NETWORK_ETHEREUM := ethereum

# Hardhat contract addresses
HARDHAT_VALIDATOR_REGISTRY := 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
HARDHAT_MATIC_X := 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
HARDHAT_STAKE_MANAGER := 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
HARDHAT_MATIC_TOKEN := 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
HARDHAT_MANAGER := 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
HARDHAT_TREASURY := 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# Localhost contract addresses
LOCALHOST_VALIDATOR_REGISTRY := 
LOCALHOST_MATIC_X := 
LOCALHOST_STAKE_MANAGER := 
LOCALHOST_MATIC_TOKEN := 
LOCALHOST_MANAGER := 
LOCALHOST_TREASURY := 

# Sepolia contract addresses
SEPOLIA_VALIDATOR_REGISTRY := 
SEPOLIA_MATIC_X := 
SEPOLIA_STAKE_MANAGER := 
SEPOLIA_MATIC_TOKEN := 
SEPOLIA_MANAGER := 
SEPOLIA_TREASURY := 

# Ethereum contract addresses
ETHEREUM_VALIDATOR_REGISTRY := 0xf556442D5B77A4B0252630E15d8BbE2160870d77
ETHEREUM_MATIC_X := 0xf03A7Eb46d01d9EcAA104558C732Cf82f6B6B645
ETHEREUM_STAKE_MANAGER := 
ETHEREUM_MATIC_TOKEN := 
ETHEREUM_MANAGER := 
ETHEREUM_TREASURY := 

# Contract paths
CONTRACT_PATH_VALIDATOR_REGISTRY := contracts/ValidatorRegistry.sol
CONTRACT_PATH_MATIC_X := contracts/MaticX.sol

all: hardhat

hardhat: deploy-validatorregistry-hardhat

localhost: deploy-validatorregistry-localhost

# Deploy the ValidatorRegistry contract
deploy-validatorregistry-hardhat:
	$(BIN_HARDHAT) deploy:validator-registry --network $(NETWORK_HARDHAT) --stake-manager $(HARDHAT_STAKE_MANAGER) --matic-token $(HARDHAT_MATIC_TOKEN) --matic-x $(HARDHAT_MATIC_X) --manager $(HARDHAT_MANAGER)
deploy-validatorregistry-localhost:
	$(BIN_HARDHAT) deploy:validator-registry --network $(NETWORK_LOCALHOST) --stake-manager $(HARDHAT_STAKE_MANAGER) --matic-token $(LOCALHOST_MATIC_TOKEN) --matic-x $(LOCALHOST_MATIC_X) --manager $(LOCALHOST_MANAGER)
deploy-validatorregistry-sepolia:
	$(BIN_HARDHAT) deploy:validator-registry --network $(NETWORK_SEPOLIA) --stake-manager $(SEPOLIA_STAKE_MANAGER) --matic-token $(SEPOLIA_MATIC_TOKEN) --matic-x $(SEPOLIA_MATIC_X) --manager $(SEPOLIA_MANAGER)
deploy-validatorregistry-ethereum:
	$(BIN_HARDHAT) deploy:validator-registry --network $(NETWORK_ETHEREUM) --stake-manager $(ETHEREUM_STAKE_MANAGER) --matic-token $(ETHEREUM_MATIC_TOKEN) --matic-x $(ETHEREUM_MATIC_X) --manager $(ETHEREUM_MANAGER)

# Deploy the MaticX contract
deploy-maticx-hardhat:
	$(BIN_HARDHAT) deploy:matic-x --network $(NETWORK_HARDHAT) --validator-registry $(HARDHAT_VALIDATOR_REGISTRY) --stake-manager $(HARDHAT_STAKE_MANAGER) --matic-token $(HARDHAT_MATIC_TOKEN) --manager $(HARDHAT_MANAGER) --treasury $(HARDHAT_TREASURY)
deploy-maticx-localhost:
	$(BIN_HARDHAT) deploy:matic-x --network $(NETWORK_LOCALHOST) --validator-registry $(LOCALHOST_VALIDATOR_REGISTRY) --stake-manager $(HARDHAT_STAKE_MANAGER) --matic-token $(LOCALHOST_MATIC_TOKEN) --manager $(LOCALHOST_MANAGER) --treasury $(LOCALHOST_TREASURY)
deploy-maticx-sepolia:
	$(BIN_HARDHAT) deploy:matic-x --network $(NETWORK_SEPOLIA) --validator-registry $(SEPOLIA_VALIDATOR_REGISTRY) --stake-manager $(SEPOLIA_STAKE_MANAGER) --matic-token $(SEPOLIA_MATIC_TOKEN) --manager $(SEPOLIA_MANAGER) --treasury $(SEPOLIA_TREASURY)
deploy-maticx-ethereum:
	$(BIN_HARDHAT) deploy:matic-x --network $(NETWORK_ETHEREUM) --validator-registry $(ETHEREUM_VALIDATOR_REGISTRY) --stake-manager $(ETHEREUM_STAKE_MANAGER) --matic-token $(ETHEREUM_MATIC_TOKEN) --manager $(ETHEREUM_MANAGER) --treasury $(ETHEREUM_TREASURY)

# Upgrade the ValidatorRegistry contract
upgrade-validatorregistry-localhost:
	$(BIN_HARDHAT) upgrade-contract --network $(NETWORK_LOCALHOST) --name ValidatorRegistry --contract $(LOCALHOST_VALIDATOR_REGISTRY)
upgrade-validatorregistry-sepolia:
	$(BIN_HARDHAT) upgrade-contract --network $(NETWORK_SEPOLIA) --name ValidatorRegistry --contract $(SEPOLIA_VALIDATOR_REGISTRY)
upgrade-validatorregistry-ethereum:
	$(BIN_HARDHAT) upgrade-contract --network $(NETWORK_ETHEREUM) --name ValidatorRegistry --contract $(ETHEREUM_VALIDATOR_REGISTRY)

# Upgrade the MaticX contract
upgrade-maticx-localhost:
	$(BIN_HARDHAT) upgrade-contract --network $(NETWORK_LOCALHOST) --name MaticX --contract $(LOCALHOST_MATIC_X)
upgrade-maticx-sepolia:
	$(BIN_HARDHAT) upgrade-contract --network $(NETWORK_SEPOLIA) --name MaticX --contract $(SEPOLIA_MATIC_X)
upgrade-maticx-ethereum:
	$(BIN_HARDHAT) upgrade-contract --network $(NETWORK_ETHEREUM) --name MaticX --contract $(ETHEREUM_MATIC_X)

# Verify the ValidatorRegistry contract
verify-validatorregistry-sepolia:
	$(BIN_HARDHAT) verify-contract --network $(NETWORK_SEPOLIA) --contract $(SEPOLIA_VALIDATOR_REGISTRY)
verify-validatorregistry-ethereum:
	$(BIN_HARDHAT) verify-contract --network $(NETWORK_ETHEREUM) --contract $(ETHEREUM_VALIDATOR_REGISTRY)

# Verify the MaticX contract
verify-maticx-sepolia:
	$(BIN_HARDHAT) verify-contract --network $(NETWORK_SEPOLIA) --contract $(SEPOLIA_MATIC_X)
verify-maticx-ethereum:
	$(BIN_HARDHAT) verify-contract --network $(NETWORK_ETHEREUM) --contract $(ETHEREUM_MATIC_X)

# Import the ValidatorRegistry contract
import-validatorregistry-sepolia:
	$(BIN_HARDHAT) import-contract --network $(NETWORK_SEPOLIA) --name ValidatorRegistry --contract $(SEPOLIA_VALIDATOR_REGISTRY)
import-validatorregistry-ethereum:
	$(BIN_HARDHAT) import-contract --network $(NETWORK_ETHEREUM) --name ValidatorRegistry --contract $(ETHEREUM_VALIDATOR_REGISTRY)

# Import the MaticX contract
import-maticx-sepolia:
	$(BIN_HARDHAT) import-contract --network $(NETWORK_SEPOLIA) --name MaticX --contract $(SEPOLIA_MATIC_X)
import-maticx-ethereum:
	$(BIN_HARDHAT) import-contract --network $(NETWORK_ETHEREUM) --name MaticX --contract $(ETHEREUM_MATIC_X)

# Analyze contracts with mythril
analyze-mytrhil-validatorregistry:
	$(BIN_MYTH) analyze $(CONTRACT_PATH_VALIDATOR_REGISTRY) --solc-json $(CONFIG_SOLC)
analyze-mytrhil-maticx:
	$(BIN_MYTH) analyze $(CONTRACT_PATH_MATIC_X) --solc-json $(CONFIG_SOLC)

# Fuzz test contracts with echidna
fuzz-echidna-maticx:
	$(BIN_ECHIDNA) . --contract FuzzMaticX $(CONFIG_ECHIDNA)
