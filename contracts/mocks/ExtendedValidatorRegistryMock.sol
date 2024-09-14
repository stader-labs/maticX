// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import { ValidatorRegistry } from "../ValidatorRegistry.sol";

contract ExtendedValidatorRegistryMock is ValidatorRegistry {
	uint256 public value;

	event ValueSet(uint256 value);

	function setValue(uint256 value_) external {
		value = value_;
		emit ValueSet(value_);
	}
}
