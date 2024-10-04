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
NETWORK_HOLESKY := holesky
NETWORK_ETHEREUM := ethereum

# Hardhat contract addresses
HARDHAT_MATIC_X := 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
HARDHAT_VALIDATOR_REGISTRY := 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
HARDHAT_STAKE_MANAGER := 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
HARDHAT_MATIC_TOKEN := 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
HARDHAT_MANAGER := 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
HARDHAT_TREASURY := 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# Localhost contract addresses
LOCALHOST_MATIC_X := 
LOCALHOST_VALIDATOR_REGISTRY := 
LOCALHOST_STAKE_MANAGER := 
LOCALHOST_MATIC_TOKEN := 
LOCALHOST_MANAGER := 
LOCALHOST_TREASURY := 

# Holesky contract addresses
HOLESKY_MATIC_X := 
HOLESKY_VALIDATOR_REGISTRY := 
HOLESKY_STAKE_MANAGER := 
HOLESKY_MATIC_TOKEN := 
HOLESKY_MANAGER := 
HOLESKY_TREASURY := 

# Ethereum contract addresses
ETHEREUM_MATIC_X := 
ETHEREUM_VALIDATOR_REGISTRY := 
ETHEREUM_STAKE_MANAGER := 
ETHEREUM_MATIC_TOKEN := 
ETHEREUM_MANAGER := 
ETHEREUM_TREASURY := 

all: hardhat

hardhat: deploy-validatorregistry-hardhat

localhost: deploy-validatorregistry-localhost

# Deploy the ValidatorRegistry contract
deploy-validatorregistry-hardhat:
	$(BIN_HARDHAT) deploy:validator-registry --network $(NETWORK_HARDHAT) --stake-manager $(HARDHAT_STAKE_MANAGER) --matic-token $(HARDHAT_MATIC_TOKEN) --matic-x $(HARDHAT_MATIC_X) --manager $(HARDHAT_MANAGER)
deploy-validatorregistry-localhost:
	$(BIN_HARDHAT) deploy:validator-registry --network $(NETWORK_LOCALHOST) --stake-manager $(HARDHAT_STAKE_MANAGER) --matic-token $(LOCALHOST_MATIC_TOKEN) --matic-x $(LOCALHOST_MATIC_X) --manager $(LOCALHOST_MANAGER)
deploy-validatorregistry-holesky:
	$(BIN_HARDHAT) deploy:validator-registry --network $(NETWORK_HOLESKY) --stake-manager $(HOLESKY_STAKE_MANAGER) --matic-token $(HOLESKY_MATIC_TOKEN) --matic-x $(HOLESKY_MATIC_X) --manager $(HOLESKY_MANAGER)
deploy-validatorregistry-ethereum:
	$(BIN_HARDHAT) deploy:validator-registry --network $(NETWORK_ETHEREUM) --stake-manager $(ETHEREUM_STAKE_MANAGER) --matic-token $(ETHEREUM_MATIC_TOKEN) --matic-x $(ETHEREUM_MATIC_X) --manager $(ETHEREUM_MANAGER)

# Deploy the MaticX contract
deploy-maticx-hardhat:
	$(BIN_HARDHAT) deploy:matic-x --network $(NETWORK_HARDHAT) --validator-registry $(HARDHAT_VALIDATOR_REGISTRY) --stake-manager $(HARDHAT_STAKE_MANAGER) --matic-token $(HARDHAT_MATIC_TOKEN) --manager $(HARDHAT_MANAGER) --treasury $(HARDHAT_TREASURY)
deploy-maticx-localhost:
	$(BIN_HARDHAT) deploy:matic-x --network $(NETWORK_LOCALHOST) --validator-registry $(LOCALHOST_VALIDATOR_REGISTRY) --stake-manager $(HARDHAT_STAKE_MANAGER) --matic-token $(LOCALHOST_MATIC_TOKEN) --manager $(LOCALHOST_MANAGER) --treasury $(LOCALHOST_TREASURY)
deploy-maticx-holesky:
	$(BIN_HARDHAT) deploy:matic-x --network $(NETWORK_HOLESKY) --validator-registry $(HOLESKY_VALIDATOR_REGISTRY) --stake-manager $(HOLESKY_STAKE_MANAGER) --matic-token $(HOLESKY_MATIC_TOKEN) --manager $(HOLESKY_MANAGER) --treasury $(HOLESKY_TREASURY)
deploy-maticx-ethereum:
	$(BIN_HARDHAT) deploy:matic-x --network $(NETWORK_ETHEREUM) --validator-registry $(ETHEREUM_VALIDATOR_REGISTRY) --stake-manager $(ETHEREUM_STAKE_MANAGER) --matic-token $(ETHEREUM_MATIC_TOKEN) --manager $(ETHEREUM_MANAGER) --treasury $(ETHEREUM_TREASURY)
