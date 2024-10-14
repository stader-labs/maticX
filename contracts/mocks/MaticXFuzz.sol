// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import { MaticX } from "../MaticX.sol";

contract MaticXFuzz is MaticX {
	function testSubmit(uint256 _amount) external {
		uint256 initialSupply = totalSupply();
		this.submit(_amount);
		assert(totalSupply() == initialSupply + _amount);
	}

	function testRequestWithdraw(uint256 _amount) external {
		uint256 initialSupply = totalSupply();
		this.submit(_amount);
		this.requestWithdraw(_amount);
		assert(totalSupply() == initialSupply - _amount);
	}
}
