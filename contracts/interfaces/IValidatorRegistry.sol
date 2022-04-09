// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

/// @title IValidatorRegistry
/// @notice Node validator registry interface
interface IValidatorRegistry {
	function addValidator(uint256 _validatorId) external;

	function removeValidator(uint256 _validatorId) external;

	function setPreferredDepositValidatorId(uint256 _validatorId) external;

	function setPreferredWithdrawalValidatorId(uint256 _validatorId) external;

	function setMaticX(address _maticX) external;

	function setVersion(string memory _version) external;

	function togglePause() external;

	function getContracts()
		external
		view
		returns (
			address _stakeManager,
			address _polygonERC20,
			address _maticX
		);

	function getValidators() external view returns (uint256[] memory);

	function getValidatorId(uint256 _index) external view returns (uint256);

	function getPreferredDepositValidatorId() external view returns (uint256);

	function getPreferredWithdrawalValidatorId()
		external
		view
		returns (uint256);

	function isRegisteredValidatorId(uint256 _validatorId)
		external
		returns (bool);

	event AddValidator(uint256 indexed _validatorId);
	event RemoveValidator(uint256 indexed _validatorId);
	event SetPreferredDepositValidatorId(uint256 indexed _validatorId);
	event SetPreferredWithdrawalValidatorId(uint256 indexed _validatorId);
	event SetMaticX(address _address);
	event SetVersion(string _version);
}
