// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/AccessControl.sol";

import "../interfaces/IRateProvider.sol";
import "../interfaces/IFxStateChildTunnel.sol";

/**
 * @title RateProvider
 */
contract RateProvider is IRateProvider, AccessControl {
	address public override fxChild;

	constructor(address _fxChild) {
		_setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

		fxChild = _fxChild;
	}

	function getRate() external view override returns (uint256) {
		return IFxStateChildTunnel(fxChild).getRate();
	}

	function setFxChild(
		address _fxChild
	) external override onlyRole(DEFAULT_ADMIN_ROLE) {
		fxChild = _fxChild;
	}
}
