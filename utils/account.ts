import { ethers } from "ethers";
import { ethers as ethersType } from "ethers";
import { EIP1193Provider } from "hardhat/types";

type HardhatEthers = typeof ethersType;

export async function getSigner(
	ethers: HardhatEthers,
	ethereum: EIP1193Provider,
	address?: string
) {
	const provider = new ethers.BrowserProvider(ethereum);
	return provider.getSigner(address);
}

export function generateRandomAddress() {
	const privateKey = `0x${Buffer.from(ethers.randomBytes(32)).toString("hex")}`;
	return new ethers.Wallet(privateKey).address;
}
