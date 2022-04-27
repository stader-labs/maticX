// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

interface IFxStateChildTunnel {
	function latestStateId() external view returns (uint256);

	function latestRootMessageSender() external view returns (address);

	function latestData() external view returns (bytes memory);

	function sendMessageToRoot(bytes memory message) external;

	function setFxRootTunnel(address _fxRootTunnel) external;

	function getReserves() external view returns (uint256, uint256);

	function getRate() external view returns (uint256);

	function convertMaticXToMatic(uint256 _balance)
		external
		view
		returns (
			uint256,
			uint256,
			uint256
		);

	function convertMaticToMaticX(uint256 _balance)
		external
		view
		returns (
			uint256,
			uint256,
			uint256
		);
}
