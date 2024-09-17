// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

/// @title IValidatorRegistry
/// @notice Defines a public interface for the ValidatorRegistry contract.
interface IValidatorRegistry {
	/// @notice Emitted when a validator is joined the MaticX protocol.
	/// @param _validatorId - Validator id
	event AddValidator(uint256 indexed _validatorId);

	/// @notice Emitted when a validator is removed from the registry.
	/// @param _validatorId - Validator id
	event RemoveValidator(uint256 indexed _validatorId);

	/// @notice Emitted when the preferred validator is set for deposits.
	/// @param _validatorId - Validator id
	event SetPreferredDepositValidatorId(uint256 indexed _validatorId);

	/// @notice Emitted when the preferred validator is set for withdrawals.
	/// @param _validatorId - Validator id
	event SetPreferredWithdrawalValidatorId(uint256 indexed _validatorId);

	/// @notice Emitted when MaticX is set.
	/// @param _address - Address of MaticX
	event SetMaticX(address _address);

	/// @notice Emitted when the new version of the current contract is set.
	/// @param _version - Version of the current contract
	event SetVersion(string _version);

	/// @notice Allows a validator that has been already staked on the stake
	/// manager contract to join the MaticX protocol.
	/// @param _validatorId - Validator id
	function addValidator(uint256 _validatorId) external;

	/// @notice Removes a validator from the registry.
	/// @param _validatorId - Validator id
	function removeValidator(uint256 _validatorId) external;

	/// @notice Sets the prefered validator id for deposits.
	/// @param _validatorId - Validator id for deposits
	function setPreferredDepositValidatorId(uint256 _validatorId) external;

	/// @notice Set the prefered validator id for withdrawals.
	/// @param _validatorId - Validator id for withdrawals
	function setPreferredWithdrawalValidatorId(uint256 _validatorId) external;

	/// @notice Sets the address of MaticX.
	/// @param _address - Address of MaticX
	function setMaticX(address _address) external;

	/// @notice Sets a new version of this contract
	/// @param _version - New version of this contract
	function setVersion(string memory _version) external;

	/// @notice Toggles the paused status of this contract.
	function togglePause() external;

	/// @notice Returns the version of the current contract.
	function version() external view returns (string memory);

	/// @notice Returns the id of the preferred validator for deposits.
	function preferredDepositValidatorId() external view returns (uint256);

	/// @notice Returns the id of the preferred validator for withdrawals.
	function preferredWithdrawalValidatorId() external view returns (uint256);

	/// @notice Checks if the given validator is joined the MaticX protocol.
	/// @param _validatorId - Validator id
	function validatorIdExists(
		uint256 _validatorId
	) external view returns (bool);

	/// @notice Returns the contract addresses used on the current contract.
	/// @return _stakeManager - Address of the stake manager
	/// @return _maticToken - Address of the Matic token
	/// @return _maticX - Address of MaticX
	/// @return _polToken - Address of the POL token
	function getContracts()
		external
		view
		returns (
			address _stakeManager,
			address _maticToken,
			address _maticX,
			address _polToken
		);

	/// @notice Returns the validator id by index.
	/// @param _index - Validator index
	/// @return Validator id
	function getValidatorId(uint256 _index) external view returns (uint256);

	/// @notice Returns all the validator addresses joined the MaticX protocol.
	/// @return List of validator addresses
	function getValidators() external view returns (uint256[] memory);
}
