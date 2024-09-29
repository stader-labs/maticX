// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { StringsUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol";
import { IStakeManager } from "./interfaces/IStakeManager.sol";
import { IValidatorShare } from "./interfaces/IValidatorShare.sol";
import { IValidatorRegistry } from "./interfaces/IValidatorRegistry.sol";

/// @title ValidatorRegistry contract
/// @notice ValidatorRegistry is the main contract that manages validators.
contract ValidatorRegistry is
	IValidatorRegistry,
	PausableUpgradeable,
	AccessControlUpgradeable,
	ReentrancyGuardUpgradeable
{
	using StringsUpgradeable for string;

	bytes32 public constant BOT = keccak256("BOT");

	IStakeManager private stakeManager;
	address private maticToken;
	address private maticX;
	string public override version;
	uint256 public override preferredDepositValidatorId;
	uint256 public override preferredWithdrawalValidatorId;
	mapping(uint256 => bool) public override validatorIdExists;
	uint256[] private validators;
	address private polToken;

	/// ------------------------------ Modifiers -------------------------------

	/// @notice Checks if the given validator id is not zero.
	modifier validatoIdIsZero(uint256 _validatorId) {
		require(_validatorId != 0, "Zero validator id");
		_;
	}

	/// @notice Checks if the given validator id exists in the registry.
	/// @param _validatorId - Validator id
	modifier whenValidatorIdExists(uint256 _validatorId) {
		require(
			validatorIdExists[_validatorId],
			"Validator id doesn't exist in our registry"
		);
		_;
	}

	/// @notice Checks if the given validator id doesn't exist in the registry.
	/// @param _validatorId - Validator id
	modifier whenValidatorIdDoesNotExist(uint256 _validatorId) {
		require(
			!validatorIdExists[_validatorId],
			"Validator id already exists in our registry"
		);
		_;
	}

	/// -------------------------- Initializers --------------------------------

	/// @dev The constructor is disabled for a proxy upgrade.
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		_disableInitializers();
	}

	/// @notice Initialize the ValidatorRegistry contract.
	/// @param _stakeManager address of the polygon stake manager
	/// @param _maticToken address of the polygon ERC20 contract
	/// @param _maticX address of the MaticX contract
	/// @param _manager address of the manager
	function initialize(
		address _stakeManager,
		address _maticToken,
		address _maticX,
		address _manager
	) external initializer {
		AccessControlUpgradeable.__AccessControl_init();
		PausableUpgradeable.__Pausable_init();

		require(_stakeManager != address(0), "Zero stake manager address");
		stakeManager = IStakeManager(_stakeManager);

		require(_maticToken != address(0), "Zero Matic token address");
		maticToken = _maticToken;

		// slither-disable-next-line missing-zero-check
		maticX = _maticX;

		require(_manager != address(0), "Zero manager address");
		_setupRole(DEFAULT_ADMIN_ROLE, _manager);
	}

	/**
	 * @dev Initializes version 2 of the current contract.
	 * @param _polToken - Address of the POL token
	 */
	function initializeV2(
		address _polToken
	) external reinitializer(2) onlyRole(DEFAULT_ADMIN_ROLE) {
		ReentrancyGuardUpgradeable.__ReentrancyGuard_init();

		require(_polToken != address(0), "Zero POL token address");
		polToken = _polToken;
	}

	/// ----------------------------- API --------------------------------------

	/// @notice Allows a validator that has been already staked on the stake
	/// manager contract to join the MaticX protocol.
	/// @param _validatorId - Validator id
	function addValidator(
		uint256 _validatorId
	)
		external
		override
		whenNotPaused
		onlyRole(DEFAULT_ADMIN_ROLE)
		validatoIdIsZero(_validatorId)
		whenValidatorIdDoesNotExist(_validatorId)
	{
		IStakeManager.Validator memory validator = stakeManager.validators(
			_validatorId
		);
		require(
			validator.contractAddress != address(0),
			"Validator has no validator share"
		);
		require(
			(validator.status == IStakeManager.Status.Active) &&
				validator.deactivationEpoch == 0,
			"Validator isn't active"
		);

		validators.push(_validatorId);
		validatorIdExists[_validatorId] = true;

		emit AddValidator(_validatorId);
	}

	/// @notice Removes a validator from the registry.
	/// @param _validatorId - Validator id
	// slither-disable-next-line pess-multiple-storage-read
	function removeValidator(
		uint256 _validatorId
	)
		external
		override
		whenNotPaused
		onlyRole(DEFAULT_ADMIN_ROLE)
		validatoIdIsZero(_validatorId)
		whenValidatorIdExists(_validatorId)
	{
		require(
			preferredDepositValidatorId != _validatorId,
			"Can't remove a preferred validator for deposits"
		);
		require(
			preferredWithdrawalValidatorId != _validatorId,
			"Can't remove a preferred validator for withdrawals"
		);

		address validatorShare = stakeManager.getValidatorContract(
			_validatorId
		);
		(uint256 validatorBalance, ) = IValidatorShare(validatorShare)
			.getTotalStake(maticX);
		require(validatorBalance == 0, "Validator has some shares left");

		uint256 iterationCount = validators.length - 1;
		for (uint256 i = 0; i < iterationCount; ) {
			if (_validatorId == validators[i]) {
				validators[i] = validators[iterationCount];
				break;
			}

			unchecked {
				++i;
			}
		}

		validators.pop();
		delete validatorIdExists[_validatorId];

		emit RemoveValidator(_validatorId);
	}

	/// ------------------------------ Setters ---------------------------------

	/// @notice Sets the prefered validator id for deposits.
	/// @param _validatorId - Validator id for deposits
	function setPreferredDepositValidatorId(
		uint256 _validatorId
	)
		external
		override
		whenNotPaused
		onlyRole(BOT)
		validatoIdIsZero(_validatorId)
		whenValidatorIdExists(_validatorId)
	{
		preferredDepositValidatorId = _validatorId;

		emit SetPreferredDepositValidatorId(_validatorId);
	}

	/// @notice Set the prefered validator id for withdrawals.
	/// @param _validatorId - Validator id for withdrawals
	function setPreferredWithdrawalValidatorId(
		uint256 _validatorId
	)
		external
		override
		whenNotPaused
		onlyRole(BOT)
		validatoIdIsZero(_validatorId)
		whenValidatorIdExists(_validatorId)
	{
		preferredWithdrawalValidatorId = _validatorId;

		emit SetPreferredWithdrawalValidatorId(_validatorId);
	}

	/// @notice Sets the address of MaticX.
	/// @param _maticX - Address of MaticX
	function setMaticX(
		address _maticX
	) external override onlyRole(DEFAULT_ADMIN_ROLE) {
		require(_maticX != address(0), "Zero MaticX address");
		maticX = _maticX;

		emit SetMaticX(_maticX);
	}

	/// @notice Sets a new version of this contract
	/// @param _version - New version of this contract
	function setVersion(
		string memory _version
	) external override onlyRole(DEFAULT_ADMIN_ROLE) {
		require(!_version.equal(""), "Empty version");
		version = _version;

		emit SetVersion(_version);
	}

	/// @notice Toggles the paused status of this contract.
	function togglePause() external override onlyRole(DEFAULT_ADMIN_ROLE) {
		paused() ? _unpause() : _pause();
	}

	/// ------------------------------ Getters ---------------------------------

	/// @notice Returns the contract addresses used on the current contract.
	/// @return _stakeManager - Address of the stake manager
	/// @return _maticToken - Address of the Matic token
	/// @return _maticX - Address of MaticX
	/// @return _polToken - Address of the POL token
	function getContracts()
		external
		view
		override
		returns (
			IStakeManager _stakeManager,
			address _maticToken,
			address _maticX,
			address _polToken
		)
	{
		_stakeManager = stakeManager;
		_maticToken = maticToken;
		_maticX = maticX;
		_polToken = polToken;
	}

	/// @notice Returns validator id by index.
	/// @param _idx - Validator index
	/// @return Validator id
	function getValidatorId(
		uint256 _idx
	) external view override returns (uint256) {
		require(_idx < validators.length, "Validator id does not exist");
		return validators[_idx];
	}

	/// @notice Returns an array of registered validator ids.
	/// @return Array of registered validator ids
	function getValidators() external view override returns (uint256[] memory) {
		return validators;
	}
}
