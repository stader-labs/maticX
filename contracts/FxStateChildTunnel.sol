// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { FxBaseChildTunnel } from "./FxBaseChildTunnel.sol";

/**
 * @title FxStateChildTunnel
 */
contract FxStateChildTunnel is FxBaseChildTunnel, AccessControl {
	uint256 public latestStateId;
	address public latestRootMessageSender;
	bytes public latestData;

	constructor(address _fxChild) FxBaseChildTunnel(_fxChild) {
		_setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
	}

	function setFxRootTunnel(
		address _fxRootTunnel
	) external override onlyRole(DEFAULT_ADMIN_ROLE) {
		fxRootTunnel = _fxRootTunnel;
	}

	function _processMessageFromRoot(
		uint256 stateId,
		address sender,
		bytes memory data
	) internal override validateSender(sender) {
		latestStateId = stateId;
		latestRootMessageSender = sender;
		latestData = data;
	}

	/**
	 * @dev Function that returns the amount of MaticX and MATIC
	 * @return First return value is the number of MaticX present, second value is MATIC
	 */
	function getReserves() public view returns (uint256, uint256) {
		(uint256 maticX, uint256 MATIC) = abi.decode(
			latestData,
			(uint256, uint256)
		);

		return (maticX, MATIC);
	}

	function getRate() external view returns (uint256) {
		(uint256 balanceInMATIC, , ) = convertMaticXToMatic(1 ether);
		return balanceInMATIC;
	}

	function convertMaticXToMatic(
		uint256 _balance
	) public view returns (uint256, uint256, uint256) {
		(uint256 maticX, uint256 matic) = getReserves();
		maticX = maticX == 0 ? 1 : maticX;
		matic = matic == 0 ? 1 : matic;

		uint256 balanceInMATIC = (_balance * matic) / maticX;

		return (balanceInMATIC, maticX, matic);
	}

	function convertMaticToMaticX(
		uint256 _balance
	) public view returns (uint256, uint256, uint256) {
		(uint256 maticX, uint256 matic) = getReserves();
		maticX = maticX == 0 ? 1 : maticX;
		matic = matic == 0 ? 1 : matic;

		uint256 balanceInMaticX = (_balance * maticX) / matic;

		return (balanceInMaticX, maticX, matic);
	}
}
