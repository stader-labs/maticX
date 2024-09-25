// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { StringsUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { IValidatorShare } from "./interfaces/IValidatorShare.sol";
import { IValidatorRegistry } from "./interfaces/IValidatorRegistry.sol";
import { IStakeManager } from "./interfaces/IStakeManager.sol";
import { IFxStateRootTunnel } from "./interfaces/IFxStateRootTunnel.sol";
import { IMaticX } from "./interfaces/IMaticX.sol";

/// @title MaticX contract
/// @notice MaticX is the main contract that manages staking and unstaking of
/// POL tokens for users.
contract MaticX is
	IMaticX,
	ERC20Upgradeable,
	AccessControlUpgradeable,
	PausableUpgradeable
{
	using SafeERC20Upgradeable for IERC20Upgradeable;
	using StringsUpgradeable for string;

	bytes32 public constant BOT = keccak256("BOT");
	uint256 private constant NOT_ENTERED = 1;
	uint256 private constant ENTERED = 2;

	address private validatorRegistry;
	address private stakeManager;
	address private maticToken;
	address public override treasury;
	string public override version;
	uint8 public override feePercent;
	address private instantPoolOwner_deprecated;
	uint256 private instantPoolMatic_deprecated;
	uint256 private instantPoolMaticX_deprecated;
	mapping(address => WithdrawalRequest[]) private userWithdrawalRequests;
	address public override fxStateRootTunnel;
	address private polToken;
	uint256 private reentrancyGuardStatus;

	/// ------------------------------ Modifiers -------------------------------

	/// @notice Enables guard from reentrant calls.
	modifier nonReentrant() {
		require(
			reentrancyGuardStatus != ENTERED,
			"ReentrancyGuard: reentrant call"
		);
		reentrancyGuardStatus = ENTERED;
		_;
		reentrancyGuardStatus = NOT_ENTERED;
	}

	/// -------------------------- Initializers --------------------------------

	/// @dev The constructor is disabled for a proxy upgrade.
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		_disableInitializers();
	}

	/// @notice Initializes the current contract.
	/// @param _validatorRegistry - Address of the validator registry
	/// @param _stakeManager - Address of the stake manager
	/// @param _maticToken - Address of the Matic token
	/// @param _manager - Address of the manager
	/// @param _treasury - Address of the treasury
	function initialize(
		address _validatorRegistry,
		address _stakeManager,
		address _maticToken,
		address _manager,
		address _treasury
	) external initializer {
		AccessControlUpgradeable.__AccessControl_init();
		PausableUpgradeable.__Pausable_init();
		ERC20Upgradeable.__ERC20_init("Liquid Staking Matic", "MaticX");

		require(
			_validatorRegistry != address(0),
			"Zero validator registry address"
		);
		validatorRegistry = _validatorRegistry;

		require(_stakeManager != address(0), "Zero stake manager address");
		stakeManager = _stakeManager;

		require(_maticToken != address(0), "Zero matic token address");
		maticToken = _maticToken;

		require(_manager != address(0), "Zero manager address");
		_setupRole(DEFAULT_ADMIN_ROLE, _manager);

		require(_treasury != address(0), "Zero treasury address");
		treasury = _treasury;

		feePercent = 5;

		IERC20Upgradeable(maticToken).safeApprove(
			stakeManager,
			type(uint256).max
		);
	}

	/// @notice Initializes version 2 of the current contract.
	/// @param _polToken - Address of the POL token
	function initializeV2(
		address _polToken
	) external reinitializer(2) onlyRole(DEFAULT_ADMIN_ROLE) {
		require(_polToken != address(0), "Zero POL token address");
		polToken = _polToken;

		_setRoleAdmin(BOT, DEFAULT_ADMIN_ROLE);

		reentrancyGuardStatus = NOT_ENTERED;

		IERC20Upgradeable(_polToken).safeApprove(
			stakeManager,
			type(uint256).max
		);
	}

	/// ----------------------------- API --------------------------------------

	/// @notice Sends Matic tokens to the current contract and mints MaticX
	/// shares in return. It requires that the sender has a preliminary approved
	/// amount of Matic to this contract.
	/// @custom:deprecated
	/// @param _amount - Amount of Matic tokens
	/// @return Amount of minted MaticX shares
	function submit(
		uint256 _amount
	) external override nonReentrant whenNotPaused returns (uint256) {
		return _submit(msg.sender, _amount, false);
	}

	/// @notice Sends POL tokens to the current contract and mints MaticX shares
	/// in return. It requires that the sender has a preliminary approved amount
	/// of POL to this contract.
	/// @param _amount - Amount of POL tokens
	/// @return Amount of minted MaticX shares
	function submitPOL(
		uint256 _amount
	) external override nonReentrant whenNotPaused returns (uint256) {
		return _submit(msg.sender, _amount, true);
	}

	/// @dev Sends POL or Matic tokens to the current contract and mints MaticX
	/// shares in return. It requires that the sender has a preliminary approved
	/// amount of stake tokens to this contract.
	/// @param sender - Address of the sender
	/// @param _amount - Amount of POL or Matic tokens
	/// @param _pol - If POL tokens are submitted
	/// @return Amount of minted MaticX shares
	// slither-disable-next-line reentrancy-benign
	function _submit(
		address sender,
		uint256 _amount,
		bool _pol
	) private returns (uint256) {
		require(_amount > 0, "Invalid amount");

		address token = _pol ? polToken : maticToken;
		IERC20Upgradeable(token).safeTransferFrom(
			sender,
			address(this),
			_amount
		);

		(
			uint256 amountToMint,
			uint256 totalShares,
			uint256 totalPooledAmount
		) = _convertPOLToMaticX(_amount);

		_mint(sender, amountToMint);
		emit Submit(sender, _amount);

		uint256 preferredValidatorId = IValidatorRegistry(validatorRegistry)
			.preferredDepositValidatorId();
		address validatorShare = IStakeManager(stakeManager)
			.getValidatorContract(preferredValidatorId);

		_pol
			? IValidatorShare(validatorShare).buyVoucherPOL(_amount, 0)
			: IValidatorShare(validatorShare).buyVoucher(_amount, 0);

		IFxStateRootTunnel(fxStateRootTunnel).sendMessageToChild(
			abi.encode(totalShares + amountToMint, totalPooledAmount + _amount)
		);

		emit Delegate(preferredValidatorId, _amount);
		return amountToMint;
	}

	/// @notice Registers a user's request to withdraw an amount of POL tokens.
	/// @param _amount - Amount of POL tokens
	// slither-disable-next-line reentrancy-no-eth
	function requestWithdraw(
		uint256 _amount
	) external override nonReentrant whenNotPaused {
		require(_amount > 0, "Invalid amount");

		(
			uint256 amountToWithdraw,
			uint256 totalShares,
			uint256 totalPooledAmount
		) = _convertMaticXToPOL(_amount);

		_burn(msg.sender, _amount);

		require(
			getTotalStakeAcrossAllValidators() >= amountToWithdraw,
			"Too much to withdraw"
		);

		uint256[] memory validatorIds = IValidatorRegistry(validatorRegistry)
			.getValidators();
		uint256 preferredValidatorId = IValidatorRegistry(validatorRegistry)
			.preferredWithdrawalValidatorId();

		uint256 currentIdx = 0;
		uint256 validatorIdCount = validatorIds.length;

		for (; currentIdx < validatorIdCount; ) {
			if (preferredValidatorId == validatorIds[currentIdx]) {
				break;
			}
			unchecked {
				++currentIdx;
			}
		}

		uint256 leftAmountToWithdraw = amountToWithdraw;
		uint256 totalAttempts = validatorIdCount;

		while (leftAmountToWithdraw > 0 && totalAttempts > 0) {
			uint256 validatorId = validatorIds[currentIdx];
			address validatorShare = IStakeManager(stakeManager)
				.getValidatorContract(validatorId);
			(uint256 validatorBalance, ) = getTotalStake(
				IValidatorShare(validatorShare)
			);

			uint256 amountToWithdrawFromValidator = (validatorBalance <=
				leftAmountToWithdraw)
				? validatorBalance
				: leftAmountToWithdraw;

			if (amountToWithdrawFromValidator > 0) {
				IValidatorShare(validatorShare).sellVoucher_newPOL(
					amountToWithdrawFromValidator,
					type(uint256).max
				);

				uint256 validatorNonce = IValidatorShare(validatorShare)
					.unbondNonces(address(this));
				uint256 requestEpoch = IStakeManager(stakeManager).epoch() +
					IStakeManager(stakeManager).withdrawalDelay();

				userWithdrawalRequests[msg.sender].push(
					WithdrawalRequest(
						validatorNonce,
						requestEpoch,
						validatorShare
					)
				);

				leftAmountToWithdraw -= amountToWithdrawFromValidator;
			}

			--totalAttempts;
			currentIdx = currentIdx + 1 < validatorIdCount ? currentIdx + 1 : 0;
		}

		require(leftAmountToWithdraw == 0, "Extra amount left to withdraw");

		IFxStateRootTunnel(fxStateRootTunnel).sendMessageToChild(
			abi.encode(
				totalShares - _amount,
				totalPooledAmount - amountToWithdraw
			)
		);

		emit RequestWithdraw(msg.sender, _amount, amountToWithdraw);
	}

	/// @notice Claims POL tokens from a validator share and sends them to the
	/// user.
	/// @param _idx - Array index of the user's withdrawal request
	function claimWithdrawal(
		uint256 _idx
	) external override nonReentrant whenNotPaused {
		uint256 balanceBeforeClaim = IERC20Upgradeable(polToken).balanceOf(
			address(this)
		);

		WithdrawalRequest[] storage userRequests = userWithdrawalRequests[
			msg.sender
		];
		require(_idx < userRequests.length, "Request not exists");

		WithdrawalRequest memory userRequest = userRequests[_idx];
		require(
			IStakeManager(stakeManager).epoch() >= userRequest.requestEpoch,
			"Not able to claim yet"
		);

		IValidatorShare(userRequest.validatorAddress).unstakeClaimTokens_newPOL(
			userRequest.validatorNonce
		);

		userRequests[_idx] = userRequests[userRequests.length - 1];
		userRequests.pop();

		uint256 amountToClaim = IERC20Upgradeable(polToken).balanceOf(
			address(this)
		) - balanceBeforeClaim;

		IERC20Upgradeable(polToken).safeTransfer(msg.sender, amountToClaim);

		emit ClaimWithdrawal(msg.sender, _idx, amountToClaim);
	}

	/// @notice Withdraws POL rewards from a given validator.
	/// @custom:deprecated
	/// @param _validatorId - Validator id to withdraw Matic rewards
	function withdrawRewards(
		uint256 _validatorId
	) external override nonReentrant whenNotPaused returns (uint256) {
		return _withdrawRewards(_validatorId);
	}

	/// @notice Withdraws POL rewards from the given validators.
	/// @param _validatorIds - Array of validator ids
	function withdrawValidatorsReward(
		uint256[] calldata _validatorIds
	) external override nonReentrant whenNotPaused returns (uint256[] memory) {
		uint256[] memory rewards = new uint256[](_validatorIds.length);
		for (uint256 i = 0; i < _validatorIds.length; i++) {
			rewards[i] = _withdrawRewards(_validatorIds[i]);
		}
		return rewards;
	}

	/// @dev Withdraw stake token rewards from the given validator.
	/// @param _validatorId - Validator id
	function _withdrawRewards(uint256 _validatorId) private returns (uint256) {
		address validatorShare = IStakeManager(stakeManager)
			.getValidatorContract(_validatorId);

		uint256 balanceBeforeRewards = IERC20Upgradeable(polToken).balanceOf(
			address(this)
		);

		IValidatorShare(validatorShare).withdrawRewardsPOL();

		uint256 rewards = IERC20Upgradeable(polToken).balanceOf(address(this)) -
			balanceBeforeRewards;

		emit WithdrawRewards(_validatorId, rewards);
		return rewards;
	}

	/// @notice Stake POL rewards and distribute fees to the treasury if any.
	/// @param _validatorId - Validator id to stake POL rewards
	function stakeRewardsAndDistributeFees(
		uint256 _validatorId
	) external override nonReentrant whenNotPaused onlyRole(BOT) {
		require(
			IValidatorRegistry(validatorRegistry).validatorIdExists(
				_validatorId
			),
			"Doesn't exist in validator registry"
		);

		uint256 reward = IERC20Upgradeable(polToken).balanceOf(address(this));
		require(reward > 0, "Reward is zero");

		uint256 treasuryFee = (reward * feePercent) / 100;
		if (treasuryFee > 0) {
			IERC20Upgradeable(polToken).safeTransfer(treasury, treasuryFee);
			emit DistributeFees(treasury, treasuryFee);
		}

		uint256 amountToStake = reward - treasuryFee;
		address validatorShare = IStakeManager(stakeManager)
			.getValidatorContract(_validatorId);
		IValidatorShare(validatorShare).buyVoucherPOL(amountToStake, 0);

		uint256 totalShares = totalSupply();
		uint256 totalPooledAmount = getTotalStakeAcrossAllValidators();

		IFxStateRootTunnel(fxStateRootTunnel).sendMessageToChild(
			abi.encode(totalShares, totalPooledAmount)
		);

		emit StakeRewards(_validatorId, amountToStake);
	}

	/// @notice Migrate all POL tokens to another validator.
	/// @param _fromValidatorId - Validator id to migrate POL tokens from
	/// @param _toValidatorId - Validator id to migrate POL tokens to
	/// @param _amount - Amount of POL tokens
	function migrateDelegation(
		uint256 _fromValidatorId,
		uint256 _toValidatorId,
		uint256 _amount
	) external override whenNotPaused onlyRole(DEFAULT_ADMIN_ROLE) {
		require(_amount > 0, "Amount is zero");
		require(
			IValidatorRegistry(validatorRegistry).validatorIdExists(
				_fromValidatorId
			),
			"From validator id does not exist in our registry"
		);
		require(
			IValidatorRegistry(validatorRegistry).validatorIdExists(
				_toValidatorId
			),
			"To validator id does not exist in our registry"
		);

		emit MigrateDelegation(_fromValidatorId, _toValidatorId, _amount);

		IStakeManager(stakeManager).migrateDelegation(
			_fromValidatorId,
			_toValidatorId,
			_amount
		);
	}

	/// @notice Toggles the paused status of this contract.
	function togglePause() external override onlyRole(DEFAULT_ADMIN_ROLE) {
		paused() ? _unpause() : _pause();
	}

	/// ------------------------------ Setters ---------------------------------

	/// @notice Sets a fee percent.
	/// @param _feePercent - Fee percent (10 = 10%)
	function setFeePercent(
		uint8 _feePercent
	) external override onlyRole(DEFAULT_ADMIN_ROLE) {
		require(_feePercent <= 100, "Fee percent must not exceed 100");

		feePercent = _feePercent;
		emit SetFeePercent(_feePercent);
	}

	/// @notice Sets the address of the treasury.
	/// @param _address Address of the treasury
	function setTreasury(
		address _address
	) external override onlyRole(DEFAULT_ADMIN_ROLE) {
		require(_address != address(0), "Zero treasury address");

		treasury = _address;
		emit SetTreasury(_address);
	}

	/// @notice Sets the address of the validator registry.
	/// @param _address Address of the validator registry
	function setValidatorRegistry(
		address _address
	) external override onlyRole(DEFAULT_ADMIN_ROLE) {
		require(_address != address(0), "Zero validator registry address");

		validatorRegistry = _address;
		emit SetValidatorRegistry(_address);
	}

	/// @notice Sets the address of the fx state root tunnel.
	/// @param _address Address of the fx state root tunnel
	function setFxStateRootTunnel(
		address _address
	) external override onlyRole(DEFAULT_ADMIN_ROLE) {
		require(_address != address(0), "Zero fx state root tunnel address");

		fxStateRootTunnel = _address;
		emit SetFxStateRootTunnel(_address);
	}

	/// @notice Sets a new version of this contract
	/// @param _version - New version of this contract
	function setVersion(
		string calldata _version
	) external override onlyRole(DEFAULT_ADMIN_ROLE) {
		require(!_version.equal(""), "Empty version");

		version = _version;
		emit SetVersion(_version);
	}

	/// ------------------------------ Getters ---------------------------------

	/// @notice Converts an amount of MaticX shares to POL tokens.
	/// @param _balance - Balance in MaticX shares
	/// @return Balance in POL tokens
	/// @return Total MaticX shares
	/// @return Total pooled POL tokens
	function convertMaticXToPOL(
		uint256 _balance
	) external view override returns (uint256, uint256, uint256) {
		return _convertMaticXToPOL(_balance);
	}

	/// @notice Converts an amount of MaticX shares to POL tokens.
	/// @custom:deprecated
	/// @param _balance - Balance in MaticX shares
	/// @return Balance in POL tokens
	/// @return Total MaticX shares
	/// @return Total pooled POL tokens
	function convertMaticXToMatic(
		uint256 _balance
	) external view override returns (uint256, uint256, uint256) {
		return _convertMaticXToPOL(_balance);
	}

	/// @dev Converts an amount of MaticX shares to POL tokens.
	/// @param _balance - Balance in MaticX shares
	/// @return Balance in POL tokens
	/// @return Total MaticX shares
	/// @return Total pooled POL tokens
	function _convertMaticXToPOL(
		uint256 _balance
	) private view returns (uint256, uint256, uint256) {
		uint256 totalShares = totalSupply();
		totalShares = totalShares == 0 ? 1 : totalShares;

		uint256 totalPooledAmount = getTotalStakeAcrossAllValidators();
		totalPooledAmount = totalPooledAmount == 0 ? 1 : totalPooledAmount;

		uint256 balanceInPOL = (_balance * (totalPooledAmount)) / totalShares;

		return (balanceInPOL, totalShares, totalPooledAmount);
	}

	/// @notice Converts an amount of POL tokens to MaticX shares.
	/// @param _balance - Balance in POL tokens
	/// @return Balance in MaticX shares
	/// @return Total MaticX shares
	/// @return Total pooled POL tokens
	function convertPOLToMaticX(
		uint256 _balance
	) external view override returns (uint256, uint256, uint256) {
		return _convertPOLToMaticX(_balance);
	}

	/// @notice Converts an amount of POL tokens to MaticX shares.
	/// @custom:deprecated
	/// @param _balance - Balance in POL tokens
	/// @return Balance in MaticX shares
	/// @return Total MaticX shares
	/// @return Total pooled POL tokens
	function convertMaticToMaticX(
		uint256 _balance
	) external view override returns (uint256, uint256, uint256) {
		return _convertPOLToMaticX(_balance);
	}

	/// @dev Converts an arbritrary amount of POL tokens to MaticX shares.
	/// @param _balance - Balance in POL tokens
	/// @return Balance in MaticX shares
	/// @return Total MaticX shares
	/// @return Total pooled POL tokens
	function _convertPOLToMaticX(
		uint256 _balance
	) private view returns (uint256, uint256, uint256) {
		uint256 totalShares = totalSupply();
		totalShares = totalShares == 0 ? 1 : totalShares;

		uint256 totalPooledAmount = getTotalStakeAcrossAllValidators();
		totalPooledAmount = totalPooledAmount == 0 ? 1 : totalPooledAmount;

		uint256 balanceInMaticX = (_balance * totalShares) / totalPooledAmount;

		return (balanceInMaticX, totalShares, totalPooledAmount);
	}

	/// @notice Returns total pooled stake tokens from all registered validators.
	/// @return Total pooled POL tokens
	function getTotalStakeAcrossAllValidators()
		public
		view
		override
		returns (uint256)
	{
		uint256[] memory validators = IValidatorRegistry(validatorRegistry)
			.getValidators();

		uint256 totalStake;
		for (uint256 i = 0; i < validators.length; ++i) {
			address validatorShare = IStakeManager(stakeManager)
				.getValidatorContract(validators[i]);
			(uint256 currValidatorShare, ) = getTotalStake(
				IValidatorShare(validatorShare)
			);

			totalStake += currValidatorShare;
		}

		return totalStake;
	}

	/// @notice Returns total pooled POL tokens from all registered validators.
	/// @custom:deprecated
	/// @return Total pooled POL tokens
	function getTotalPooledMatic() external view override returns (uint256) {
		return getTotalStakeAcrossAllValidators();
	}

	/// @notice Returns the total stake of this contract for the given validator
	/// share.
	/// @param _validatorShare - Address of the validator share
	/// @return Total stake of this contract
	function getTotalStake(
		IValidatorShare _validatorShare
	) public view override returns (uint256, uint256) {
		return _validatorShare.getTotalStake(address(this));
	}

	/// @notice Returns all withdrawal requests initiated by the user.
	/// @param _address - Address of the user
	/// @return userWithdrawalRequests Array of user's withdrawal requests
	function getUserWithdrawalRequests(
		address _address
	) external view override returns (WithdrawalRequest[] memory) {
		return userWithdrawalRequests[_address];
	}

	/// @dev Returns a shares amount of the withdrawal request.
	/// @param _address - Address of the user
	/// @param _idx Index of the withdrawal request
	/// @return Share amount fo the withdrawal request
	function getSharesAmountOfUserWithdrawalRequest(
		address _address,
		uint256 _idx
	) external view override returns (uint256) {
		WithdrawalRequest memory userRequest = userWithdrawalRequests[_address][
			_idx
		];
		IValidatorShare validatorShare = IValidatorShare(
			userRequest.validatorAddress
		);
		IValidatorShare.DelegatorUnbond memory unbond = validatorShare
			.unbonds_new(address(this), userRequest.validatorNonce);

		return unbond.shares;
	}

	/// @notice Returns the contract addresses used on the current contract.
	/// @return _stakeManager - Address of the stake manager
	/// @return _maticToken - Address of the Matic token
	/// @return _validatorRegistry - Address of the validator registry
	/// @return _polToken - Address of the POL token
	function getContracts()
		external
		view
		override
		returns (
			address _stakeManager,
			address _maticToken,
			address _validatorRegistry,
			address _polToken
		)
	{
		_stakeManager = stakeManager;
		_maticToken = maticToken;
		_validatorRegistry = validatorRegistry;
		_polToken = polToken;
	}
}
