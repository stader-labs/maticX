// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { IValidatorShare } from "./IValidatorShare.sol";

/// @title MaticX interface
/// @notice Defines a public interface for the MaticX contract.
interface IMaticX is IERC20Upgradeable {
	struct WithdrawalRequest {
		// Validator's incremental nonce
		uint256 validatorNonce;
		// Request epoch number
		uint256 requestEpoch;
		// Address of the validator share
		address validatorAddress;
	}

	/// @notice Emitted when the user submits her stake tokens.
	/// @param _from - User who stakes
	/// @param _amount - Stake amount
	event Submit(address indexed _from, uint256 _amount);

	/// @notice Emitted when the user submits her stake tokens.
	/// @param _validatorId - Validator which accepted the user's stake
	/// @param _amountDelegated - Stake amount
	event Delegate(uint256 indexed _validatorId, uint256 _amountDelegated);

	/// @notice Emitted when the user requests a withdrawal for her previously
	// staked tokens.
	/// @param _from - User who requests a withdrawal
	/// @param _amountInMaticX - Requested amount in MaticX shares
	/// @param _amountInStakeTokens - Requested amount in stake tokens
	event RequestWithdraw(
		address indexed _from,
		uint256 _amountInMaticX,
		uint256 _amountInStakeTokens
	);

	/// @notice Emitted when the user claims a previously requested withdrawal.
	/// @param _from - User who claims a withdrawal
	/// @param _idx - Withdrawal index
	/// @param _claimedAmount - Claimed amount in stake tokens
	event ClaimWithdrawal(
		address indexed _from,
		uint256 indexed _idx,
		uint256 _claimedAmount
	);

	/// @notice Emitted when rewards are withdrawn from a given validator.
	/// @param _validatorId - Validator id
	/// @param _rewards - Rewards amount
	event WithdrawRewards(uint256 indexed _validatorId, uint256 _rewards);

	/// @notice Emitted when rewards are staked at a given validator.
	/// @param _validatorId - Validator id
	/// @param _stakedAmount - Staked amount
	event StakeRewards(uint256 indexed _validatorId, uint256 _stakedAmount);

	/// @notice Emitted when fees are distributed to the treasury.
	/// @param _treasury - Address of the treasury
	/// @param _feeAmount - Fee amount
	event DistributeFees(address indexed _treasury, uint256 _feeAmount);

	/// @notice Emitted when stake tokens are delegated to a new validator.
	/// @param _fromValidatorId - Validator id to migrate stake tokens from
	/// @param _toValidatorId - Validator id to migrate stake tokens to
	/// @param _amount - Amount of stake tokens
	event MigrateDelegation(
		uint256 indexed _fromValidatorId,
		uint256 indexed _toValidatorId,
		uint256 _amount
	);

	/// @notice Emitted when the fee percent is set.
	/// @param _feePercent - Fee percent
	event SetFeePercent(uint8 _feePercent);

	/// @notice Emitted when the address of the treasury is set.
	/// @param _address - Address of the treasury
	event SetTreasury(address _address);

	/// @notice Emitted when the address of the validator registry is set.
	/// @param _address - Address of the validator registry
	event SetValidatorRegistry(address _address);

	/// @notice Emitted when the address of the fx state root tunnel is set.
	/// @param _address - Address of the fx state root tunnel
	event SetFxStateRootTunnel(address _address);

	/// @notice Emitted when the new version of the current contract is set.
	/// @param _version - Version of the current contract
	event SetVersion(string _version);

	/// @notice Emitted when the address of the POL token is set.
	/// @param _address - Address of the POL token
	event SetPOLToken(address _address);

	/// @notice Sends Matic tokens to the current contract and mints MaticX
	/// shares in return. It requires that the sender has a preliminary approved
	/// amount of Matic to this contract.
	/// @custom:deprecated
	/// @param _amount - Amount of Matic tokens
	/// @return Amount of minted MaticX shares
	function submit(uint256 _amount) external returns (uint256);

	/// @notice Sends POL tokens to the current contract and mints MaticX shares
	/// in return. It requires that the sender has a preliminary approved amount
	/// of POL to this contract.
	/// @param _amount - Amount of POL tokens
	/// @return Amount of minted MaticX shares
	function submitPOL(uint256 _amount) external returns (uint256);

	/// @notice Registers a user's request to withdraw an amount of POL tokens.
	/// @param _amount - Amount of POL tokens
	function requestWithdraw(uint256 _amount) external;

	/// @notice Claims POL tokens from a validator share and sends them to the
	/// user.
	/// @param _idx - Array index of the user's withdrawal request
	function claimWithdrawal(uint256 _idx) external;

	/// @notice Withdraws POL rewards from the given validator.
	/// @custom:deprecated
	/// @param _validatorId - Validator id to withdraw Matic rewards
	function withdrawRewards(uint256 _validatorId) external returns (uint256);

	/// @notice Withdraws POL rewards from the given validators.
	/// @param _validatorIds - Array of validator ids to withdraw Matic rewards
	function withdrawValidatorsReward(
		uint256[] calldata _validatorIds
	) external returns (uint256[] memory);

	/// @notice Stake Matic rewards and distribute fees to the treasury if any.
	/// @param _validatorId - Validator id to stake Matic rewards
	function stakeRewardsAndDistributeFees(uint256 _validatorId) external;

	/// @notice Migrate all stake tokens to another validator.
	/// @param _fromValidatorId - Validator id to migrate stake tokens from
	/// @param _toValidatorId - Validator id to migrate stake tokens to
	/// @param _amount - Amount of stake tokens
	function migrateDelegation(
		uint256 _fromValidatorId,
		uint256 _toValidatorId,
		uint256 _amount
	) external;

	/// @notice Toggles the paused status of this contract.
	function togglePause() external;

	/// @notice Converts an amount of MaticX shares to POL tokens.
	/// @param _balance - Balance in MaticX
	/// @return Balance in POL tokens
	/// @return Total MaticX shares
	/// @return Total pooled POL tokens
	function convertMaticXToPOL(
		uint256 _balance
	) external view returns (uint256, uint256, uint256);

	/// @notice Converts an amount of MaticX shares to POL tokens.
	/// @custom:deprecated
	/// @param _balance - Balance in MaticX
	/// @return Balance in POL tokens
	/// @return Total MaticX shares
	/// @return Total pooled POL tokens
	function convertMaticXToMatic(
		uint256 _balance
	) external view returns (uint256, uint256, uint256);

	/// @notice Converts an amount of POL tokens to MaticX shares.
	/// @param _balance - Balance in POL
	/// @return Total MaticX shares
	/// @return Balance in POL tokens
	/// @return Total pooled POL tokens
	function convertPOLToMaticX(
		uint256 _balance
	) external view returns (uint256, uint256, uint256);

	/// @notice Converts an amount of POL tokens to MaticX shares.
	/// @custom:deprecated
	/// @param _balance - Balance in POL
	/// @return Total MaticX shares
	/// @return Balance in POL tokens
	/// @return Total pooled POL tokens
	function convertMaticToMaticX(
		uint256 _balance
	) external view returns (uint256, uint256, uint256);

	/// @notice Sets a fee percent.
	/// @param _feePercent - Fee percent (10 = 10%)
	function setFeePercent(uint8 _feePercent) external;

	/// @notice Sets the address of the treasury.
	/// @param _address Address of the treasury
	function setTreasury(address _address) external;

	/// @notice Sets the address of the validator registry.
	/// @param _address Address of the validator registry
	function setValidatorRegistry(address _address) external;

	/// @notice Sets the address of the fx state root tunnel.
	/// @param _address Address of the fx state root tunnel
	function setFxStateRootTunnel(address _address) external;

	/// @notice Sets a new version of this contract
	/// @param _version - New version of this contract
	function setVersion(string calldata _version) external;

	/// @notice Returns total pooled stake tokens from all registered validators.
	/// @return Total pooled stake tokens
	function getTotalStakeAcrossAllValidators() external view returns (uint256);

	/// @notice Returns total pooled stake tokens from all registered validators.
	/// @custom:deprecated
	/// @return Total pooled stake tokens
	function getTotalPooledMatic() external view returns (uint256);

	/// @notice Returns the total stake of this contract for the given validator
	/// share.
	/// @param _validatorShare - Address of the validator share
	/// @return Total stake of this contract
	function getTotalStake(
		IValidatorShare _validatorShare
	) external view returns (uint256, uint256);

	/// @notice Returns all withdrawal requests initiated by the user.
	/// @param _address - Address of the user
	/// @return userWithdrawalRequests Array of user's withdrawal requests
	function getUserWithdrawalRequests(
		address _address
	) external view returns (WithdrawalRequest[] memory);

	/// @dev Returns a shares amount of the withdrawal request.
	/// @param _address - Address of the user
	/// @param _idx Index of the withdrawal request
	/// @return Share amount fo the withdrawal request
	function getSharesAmountOfUserWithdrawalRequest(
		address _address,
		uint256 _idx
	) external view returns (uint256);

	/// @notice Returns the contract addresses used on the current contract.
	/// @return _stakeManager - Address of the stake manager
	/// @return _maticToken - Address of the Matic token
	/// @return _validatorRegistry - Address of the validator registry
	/// @return _polToken - Address of the POL token
	function getContracts()
		external
		view
		returns (
			address _stakeManager,
			address _maticToken,
			address _validatorRegistry,
			address _polToken
		);

	/// @notice Returns the address of the treasury.
	function treasury() external view returns (address);

	/// @notice Returns the version of the current contract.
	function version() external view returns (string memory);

	/// @notice Returns the fee percent.
	function feePercent() external view returns (uint8);

	/// @notice Returns the address of the fx state root tunnel.
	function fxStateRootTunnel() external view returns (address);
}
