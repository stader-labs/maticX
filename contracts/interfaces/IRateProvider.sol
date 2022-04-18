// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

interface IRateProvider {
	function getRate() external view returns (uint256);

	function setFxChild(address _fxChild) external;

	function fxChild() external view returns (address);
}
