import { ethers } from "hardhat";

export function generateRandomAddress(): string {
	const privateKey = `0x${Buffer.from(ethers.utils.randomBytes(32)).toString("hex")}`;
	return new ethers.Wallet(privateKey).address;
}
