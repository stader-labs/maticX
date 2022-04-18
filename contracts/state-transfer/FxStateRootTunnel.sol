// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";

import { FxBaseRootTunnel } from "../tunnel/FxBaseRootTunnel.sol";

/**
 * @title FxStateRootTunnel
 */
contract FxStateRootTunnel is FxBaseRootTunnel, Ownable {
	bytes public latestData;
	address public maticX;

	constructor(
		address _checkpointManager,
		address _fxRoot,
		address _fxChildTunnel,
		address _maticX
	) FxBaseRootTunnel(_checkpointManager, _fxRoot) {
		setFxChildTunnel(_fxChildTunnel);
		maticX = _maticX;
	}

	function _processMessageFromChild(bytes memory data) internal override {
		latestData = data;
	}

	function sendMessageToChild(bytes memory message) public {
		require(msg.sender == maticX, "Not maticX");
		_sendMessageToChild(message);
	}

	function setMaticX(address _maticX) external onlyOwner {
		maticX = _maticX;
	}
}
