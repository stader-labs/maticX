// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPolygonMigration {
	event Migrated(address indexed account, uint256 amount);

	event Unmigrated(
		address indexed account,
		address indexed recipient,
		uint256 amount
	);

	event UnmigrationLockUpdated(bool lock);

	error UnmigrationLocked();

	error InvalidAddressOrAlreadySet();

	error InvalidAddress();

	function migrate(uint256 amount) external;

	function unmigrate(uint256 amount) external;

	function unmigrateTo(address recipient, uint256 amount) external;

	function unmigrateWithPermit(
		uint256 amount,
		uint256 deadline,
		uint8 v,
		bytes32 r,
		bytes32 s
	) external;

	function updateUnmigrationLock(bool unmigrationLocked) external;

	function burn(uint256 amount) external;

	function matic() external view returns (IERC20 maticToken);

	function polygon() external view returns (IERC20 polygonEcosystemToken);

	function unmigrationLocked()
		external
		view
		returns (bool isUnmigrationLocked);

	function version() external pure returns (string memory version);
}
