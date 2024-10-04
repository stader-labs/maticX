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
HARDHAT_MATICX := 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
HARDHAT_VALIDATOR_REGISTRY := 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
HARDHAT_STAKE_MANAGER := 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
HARDHAT_MATIC_TOKEN := 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
HARDHAT_MATICX := 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
HARDHAT_MANAGER := 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# Localhost contract addresses
LOCALHOST_MATICX := 
LOCALHOST_VALIDATOR_REGISTRY := 
LOCALHOST_STAKE_MANAGER := 
LOCALHOST_MATIC_TOKEN := 
LOCALHOST_MATICX := 
LOCALHOST_MANAGER := 

# Holesky contract addresses
HOLESKY_MATICX := 
HOLESKY_VALIDATOR_REGISTRY := 
HOLESKY_STAKE_MANAGER := 
HOLESKY_MATIC_TOKEN := 
HOLESKY_MATICX := 
HOLESKY_MANAGER := 

# Ethereum contract addresses
ETHEREUM_MATICX := 
ETHEREUM_VALIDATOR_REGISTRY := 
ETHEREUM_STAKE_MANAGER := 
ETHEREUM_MATIC_TOKEN := 
ETHEREUM_MATICX := 
ETHEREUM_MANAGER := 

all: hardhat

hardhat: deploy-validatorregistry-hardhat

localhost: deploy-validatorregistry-localhost

# Deploy the MaticX contract
deploy-validatorregistry-hardhat:
	$(BIN_HARDHAT) deploy:validator-registry --network $(NETWORK_HARDHAT) --stake-manager $(HARDHAT_STAKE_MANAGER) --matic-token $(HARDHAT_MATIC_TOKEN) --matic-x $(HARDHAT_MATICX) --manager $(HARDHAT_MANAGER)
deploy-validatorregistry-localhost:
	$(BIN_HARDHAT) deploy:validator-registry --network $(NETWORK_LOCALHOST)
deploy-validatorregistry-holesky:
	$(BIN_HARDHAT) deploy:validator-registry --network $(NETWORK_HOLESKY)
deploy-validatorregistry-ethereum:
	$(BIN_HARDHAT) deploy:validator-registry --network $(NETWORK_ETHEREUM)
