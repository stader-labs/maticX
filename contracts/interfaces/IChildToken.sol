// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.8;

interface IChildToken {
	function deposit(address user, bytes calldata depositData) external;

	function withdraw(uint256 amount) external;
}
