export enum Provider {
	Alchemy = "alchemy",
	Infura = "infura",
}

export enum Network {
	Hardhat = "hardhat",
	Localhost = "localhost",
	Holesky = "holesky",
	Ethereum = "ethereum",
	EthereumAlt = "mainnet",
}

export function getProviderUrl(
	network: Network,
	provider: Provider,
	apiKey: string
): string {
	if (network === Network.Localhost) {
		return "http://127.0.0.1:8545";
	}

	const urls: Record<string, Record<Provider, string | undefined>> = {
		[Network.Holesky]: {
			[Provider.Alchemy]: "https://eth-holesky.g.alchemy.com",
			[Provider.Infura]: "https://holesky.infura.io",
		},
		[Network.Ethereum]: {
			[Provider.Alchemy]: "https://eth-mainnet.g.alchemy.com",
			[Provider.Infura]: "https://mainnet.infura.io",
		},
		[Network.EthereumAlt]: {
			[Provider.Alchemy]: "https://eth-mainnet.g.alchemy.com",
			[Provider.Infura]: "https://mainnet.infura.io",
		},
	};

	const apiVersions: Record<Provider, number> = {
		[Provider.Alchemy]: 2,
		[Provider.Infura]: 3,
	};

	return (
		provider &&
		`${urls[network][provider]}/v${apiVersions[provider]}/${apiKey}`
	);
}

export function isLocalNetwork(network: Network): boolean {
	return [Network.Hardhat, Network.Localhost].includes(network);
}

export function isTestNetwork(network: Network): boolean {
	return [Network.Holesky].includes(network);
}

export function isMainNetwork(network: Network): boolean {
	return [Network.Ethereum, Network.EthereumAlt].includes(network);
}
