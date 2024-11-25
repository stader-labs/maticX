// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import { TimelockController as OpenzeppelinTimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";

contract TimelockController is OpenzeppelinTimelockController {
	constructor(
		uint256 minDelay,
		address[] memory proposers,
		address[] memory executors,
		address admin
	) OpenzeppelinTimelockController(minDelay, proposers, executors, admin) {}
}
