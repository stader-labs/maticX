// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import { MaticX } from "../MaticX.sol";

contract MaticXMock is MaticX {
	uint256 public value;

	event ValueSet(uint256 value);

	function setValue(uint256 value_) external {
		value = value_;
		emit ValueSet(value_);
	}
}
