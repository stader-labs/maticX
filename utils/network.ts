export enum Provider {
	Alchemy = "alchemy",
	Ankr = "ankr",
	Infura = "infura",
}

export enum Network {
	Hardhat = "hardhat",
	Localhost = "localhost",
	Sepolia = "sepolia",
	Amoy = "amoy",
	AmoyAlt = "polygonAmoy",
	Ethereum = "ethereum",
	EthereumAlt = "mainnet",
	Polygon = "polygon",
}

export function getProviderUrl(
	network: Network,
	provider: Provider,
	apiKey?: string
): string {
	if (network === Network.Localhost) {
		return "http://127.0.0.1:8545";
	}

	const urls: Record<string, Record<Provider, string>> = {
		[Network.Sepolia]: {
			[Provider.Alchemy]: "https://eth-sepolia.g.alchemy.com",
			[Provider.Ankr]: "https://rpc.ankr.com/eth_sepolia",
			[Provider.Infura]: "https://sepolia.infura.io",
		},
		[Network.Amoy]: {
			[Provider.Alchemy]: "https://polygon-amoy.g.alchemy.com",
			[Provider.Ankr]: "https://rpc.ankr.com/polygon_amoy",
			[Provider.Infura]: "https://polygon-amoy.infura.io",
		},
		[Network.AmoyAlt]: {
			[Provider.Alchemy]: "https://polygon-amoy.g.alchemy.com",
			[Provider.Ankr]: "https://rpc.ankr.com/polygon_amoy",
			[Provider.Infura]: "https://polygon-amoy.infura.io",
		},
		[Network.Ethereum]: {
			[Provider.Alchemy]: "https://eth-mainnet.g.alchemy.com",
			[Provider.Ankr]: "https://rpc.ankr.com/eth",
			[Provider.Infura]: "https://mainnet.infura.io",
		},
		[Network.EthereumAlt]: {
			[Provider.Alchemy]: "https://eth-mainnet.g.alchemy.com",
			[Provider.Ankr]: "https://rpc.ankr.com/eth",
			[Provider.Infura]: "https://mainnet.infura.io",
		},
		[Network.Polygon]: {
			[Provider.Alchemy]: "https://polygon-mainnet.g.alchemy.com",
			[Provider.Ankr]: "https://rpc.ankr.com/polygon",
			[Provider.Infura]: "https://polygon-mainnet.infura.io",
		},
	};

	const apiVersions: Record<Provider, number> = {
		[Provider.Alchemy]: 2,
		[Provider.Infura]: 3,
		[Provider.Ankr]: 0,
	};

	const urlParts = [urls[network][provider]];
	if (apiVersions[provider] !== 0) {
		urlParts.push(`v${apiVersions[provider]}`);
	}
	if (
		[Provider.Alchemy, Provider.Infura].includes(provider) &&
		typeof apiKey !== "undefined"
	) {
		urlParts.push(apiKey);
	}

	return urlParts.join("/");
}

export function isLocalNetwork(network: Network): boolean {
	return [Network.Hardhat, Network.Localhost].includes(network);
}

export function isTestNetwork(network: Network): boolean {
	return [Network.Sepolia, Network.Amoy, Network.AmoyAlt].includes(network);
}

export function isMainNetwork(network: Network): boolean {
	return [Network.Ethereum, Network.EthereumAlt, Network.Polygon].includes(
		network
	);
}
