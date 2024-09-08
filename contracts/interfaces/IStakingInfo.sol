// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

interface IStakingInfo {
	event ShareMinted(
		uint256 indexed validatorId,
		address indexed user,
		uint256 indexed amount,
		uint256 tokens
	);
}
