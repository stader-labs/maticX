// eslint-disable-next-line no-undef
module.exports = {
	configureYulOptimizer: true,
	network: "hardhat",
	skipFiles: ["interfaces/", "lib/", "mocks/", "state-transfer/", "tunnel/"],
};
