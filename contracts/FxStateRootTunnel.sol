// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { FxBaseRootTunnel } from "./FxBaseRootTunnel.sol";

/**
 * @title FxStateRootTunnel
 */
contract FxStateRootTunnel is FxBaseRootTunnel, AccessControl {
	bytes public latestData;
	address public maticX;

	constructor(
		address _checkpointManager,
		address _fxRoot,
		address _maticX
	) FxBaseRootTunnel(_checkpointManager, _fxRoot) {
		_setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

		maticX = _maticX;
	}

	function _processMessageFromChild(bytes memory data) internal override {
		latestData = data;
	}

	function sendMessageToChild(bytes memory message) public {
		require(msg.sender == maticX, "Not maticX");
		_sendMessageToChild(message);
	}

	function setMaticX(address _maticX) external onlyRole(DEFAULT_ADMIN_ROLE) {
		maticX = _maticX;
	}

	function setFxChildTunnel(
		address _fxChildTunnel
	) external override onlyRole(DEFAULT_ADMIN_ROLE) {
		fxChildTunnel = _fxChildTunnel;
	}
}
