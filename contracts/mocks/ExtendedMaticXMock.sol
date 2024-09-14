// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import { MaticX } from "../MaticX.sol";

contract ExtendedMaticXMock is MaticX {
	uint256 public value;

	event ValueSet(uint256 value);

	function setValue(uint256 value_) external {
		value = value_;
		emit ValueSet(value_);
	}
}
