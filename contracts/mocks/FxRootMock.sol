// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "../tunnel/FxBaseChildTunnel.sol";

contract FxRootMock {
	uint256 stateId;

	function sendMessageToChild(address fxChildTunnel, bytes memory _message)
		external
	{
		FxBaseChildTunnel(fxChildTunnel).processMessageFromRoot(
			stateId,
			address(this),
			_message
		);
		stateId++;
	}
}
