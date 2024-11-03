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
	uint256 private constant MAX_FEE_PERCENT = 1_500; // 15%
	uint256 private constant BASIS_POINTS = 10_000;
	uint256 private constant NOT_ENTERED = 1;
	uint256 private constant ENTERED = 2;

	IValidatorRegistry private validatorRegistry;
	IStakeManager private stakeManager;
	IERC20Upgradeable private maticToken;
	address public override treasury;
	string public override version;
	uint16 public override feePercent;
	address public override instantPoolOwner;
	uint256 public override instantPoolMatic;
	uint256 public override instantPoolMaticX;
	mapping(address => WithdrawalRequest[]) private userWithdrawalRequests;
	IFxStateRootTunnel public override fxStateRootTunnel;
	IERC20Upgradeable private polToken;
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
		validatorRegistry = IValidatorRegistry(_validatorRegistry);

		require(_stakeManager != address(0), "Zero stake manager address");
		stakeManager = IStakeManager(_stakeManager);

		require(_maticToken != address(0), "Zero Matic token address");
		maticToken = IERC20Upgradeable(_maticToken);

		require(_manager != address(0), "Zero manager address");
		_setupRole(DEFAULT_ADMIN_ROLE, _manager);

		require(_treasury != address(0), "Zero treasury address");
		treasury = _treasury;

		feePercent = 5;

		IERC20Upgradeable(maticToken).safeApprove(
			_stakeManager,
			type(uint256).max
		);
	}

	/// @notice Initializes version 2 of the current contract.
	/// @param _polToken - Address of the POL token
	function initializeV2(
		address _polToken
	) external reinitializer(2) onlyRole(DEFAULT_ADMIN_ROLE) {
		require(_polToken != address(0), "Zero POL token address");
		polToken = IERC20Upgradeable(_polToken);

		_setRoleAdmin(BOT, DEFAULT_ADMIN_ROLE);

		version = "2";
		instantPoolOwner = address(0);
		instantPoolMatic = 0;
		instantPoolMaticX = 0;
		feePercent = 500;
		reentrancyGuardStatus = NOT_ENTERED;

		IERC20Upgradeable(_polToken).safeApprove(
			address(stakeManager),
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

		IERC20Upgradeable token = _pol ? polToken : maticToken;
		token.safeTransferFrom(sender, address(this), _amount);

		(
			uint256 amountToMint,
			uint256 totalShares,
			uint256 totalPooledAmount
		) = _convertPOLToMaticX(_amount);

		_mint(sender, amountToMint);
		emit Submit(sender, _amount);

		uint256 preferredValidatorId = validatorRegistry
			.preferredDepositValidatorId();
		IValidatorShare validatorShare = IValidatorShare(
			stakeManager.getValidatorContract(preferredValidatorId)
		);

		_pol
			? validatorShare.buyVoucherPOL(_amount, 0)
			: validatorShare.buyVoucher(_amount, 0);

		fxStateRootTunnel.sendMessageToChild(
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

		uint256[] memory validatorIds = validatorRegistry.getValidators();
		uint256 currentIdx = _getWithdrawalValidatorIndex(validatorIds);

		uint256 leftAmountToWithdraw = amountToWithdraw;
		uint256 validatorIdCount = validatorIds.length;
		uint256 totalIterations = validatorIdCount;
		uint256 requestEpoch = stakeManager.epoch();

		while (leftAmountToWithdraw > 0 && totalIterations > 0) {
			uint256 validatorId = validatorIds[currentIdx];
			IValidatorShare validatorShare = IValidatorShare(
				stakeManager.getValidatorContract(validatorId)
			);
			(uint256 validatorBalance, ) = getTotalStake(validatorShare);

			uint256 amountToWithdrawFromValidator = (validatorBalance <=
				leftAmountToWithdraw)
				? validatorBalance
				: leftAmountToWithdraw;

			if (amountToWithdrawFromValidator > 0) {
				validatorShare.sellVoucher_newPOL(
					amountToWithdrawFromValidator,
					type(uint256).max
				);

				uint256 validatorNonce = validatorShare.unbondNonces(
					address(this)
				);

				userWithdrawalRequests[msg.sender].push(
					WithdrawalRequest(
						validatorNonce,
						requestEpoch,
						address(validatorShare)
					)
				);

				leftAmountToWithdraw -= amountToWithdrawFromValidator;
			}

			--totalIterations;
			currentIdx = currentIdx + 1 < validatorIdCount ? currentIdx + 1 : 0;
		}

		require(leftAmountToWithdraw == 0, "Extra amount left to withdraw");

		fxStateRootTunnel.sendMessageToChild(
			abi.encode(
				totalShares - _amount,
				totalPooledAmount - amountToWithdraw
			)
		);

		emit RequestWithdraw(msg.sender, _amount, amountToWithdraw);
	}

	/// @dev Returns the starting validator index for a user's withdrawal request.
	/// @param validatorIds - Array of validator ids
	/// @return Starting validator index
	function _getWithdrawalValidatorIndex(
		uint256[] memory validatorIds
	) private view returns (uint256) {
		uint256 preferredValidatorId = validatorRegistry
			.preferredWithdrawalValidatorId();

		uint256 idx = 0;
		uint256 validatorIdCount = validatorIds.length;

		for (; idx < validatorIdCount; ) {
			if (preferredValidatorId == validatorIds[idx]) {
				break;
			}
			unchecked {
				++idx;
			}
		}

		return idx;
	}

	/// @notice Claims POL tokens from a validator share and sends them to the
	/// user.
	/// @param _idx - Array index of the user's withdrawal request
	function claimWithdrawal(
		uint256 _idx
	) external override nonReentrant whenNotPaused {
		WithdrawalRequest[] storage userRequests = userWithdrawalRequests[
			msg.sender
		];
		require(
			_idx < userRequests.length,
			"Withdrawal request does not exist"
		);

		WithdrawalRequest memory userRequest = userRequests[_idx];
		require(
			stakeManager.epoch() >=
				userRequest.requestEpoch + stakeManager.withdrawalDelay(),
			"Not able to claim yet"
		);

		uint256 balanceBeforeClaim = IERC20Upgradeable(polToken).balanceOf(
			address(this)
		);

		IValidatorShare(userRequest.validatorAddress).unstakeClaimTokens_newPOL(
			userRequest.validatorNonce
		);

		userRequests[_idx] = userRequests[userRequests.length - 1];
		userRequests.pop();

		uint256 amountToClaim = polToken.balanceOf(address(this)) -
			balanceBeforeClaim;

		polToken.safeTransfer(msg.sender, amountToClaim);

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
		uint256 validatorIdCount = _validatorIds.length;
		uint256[] memory rewards = new uint256[](validatorIdCount);

		for (uint256 i = 0; i < validatorIdCount; ) {
			rewards[i] = _withdrawRewards(_validatorIds[i]);
			unchecked {
				++i;
			}
		}
		return rewards;
	}

	/// @dev Withdraws POL rewards from the given validator.
	/// @param _validatorId - Validator id
	function _withdrawRewards(uint256 _validatorId) private returns (uint256) {
		IValidatorShare validatorShare = IValidatorShare(
			stakeManager.getValidatorContract(_validatorId)
		);

		uint256 balanceBeforeRewards = polToken.balanceOf(address(this));

		validatorShare.withdrawRewardsPOL();

		uint256 rewards = polToken.balanceOf(address(this)) -
			balanceBeforeRewards;

		emit WithdrawRewards(_validatorId, rewards);
		return rewards;
	}

	/// @notice Stakes POL rewards and distribute fees to the treasury if any.
	/// @param _validatorId - Validator id to stake POL rewards
	function stakeRewardsAndDistributeFees(
		uint256 _validatorId
	) external override nonReentrant whenNotPaused onlyRole(BOT) {
		_stakeRewardsAndDistributeFees(_validatorId, true, true);
	}

	/// @notice Stakes Matic rewards and distribute fees to the treasury if any.
	/// @custom:deprecated
	/// @param _validatorId - Validator id to stake Matic rewards
	function stakeRewardsAndDistributeFeesMatic(
		uint256 _validatorId
	) external override nonReentrant whenNotPaused onlyRole(BOT) {
		_stakeRewardsAndDistributeFees(_validatorId, false, true);
	}

	/// @notice Stakes token rewards and distribute fees to the treasury if any.
	/// @param _validatorId - Validator id to stake toke rewards
	/// @param _pol - If POL tokens are used for staking and fee distribution
	/// @param _revertOnZeroReward - If revert on the zero reward or not
	function _stakeRewardsAndDistributeFees(
		uint256 _validatorId,
		bool _pol,
		bool _revertOnZeroReward
	) private {
		require(
			validatorRegistry.validatorIdExists(_validatorId),
			"Doesn't exist in validator registry"
		);

		IERC20Upgradeable token = _pol ? polToken : maticToken;
		uint256 reward = token.balanceOf(address(this));
		if (reward == 0) {
			if (_revertOnZeroReward) {
				revert("Reward is zero");
			}
			return;
		}

		uint256 treasuryFee = (reward * feePercent) / BASIS_POINTS;
		if (treasuryFee > 0) {
			token.safeTransfer(treasury, treasuryFee);
			emit DistributeFees(treasury, treasuryFee);
		}

		uint256 amountToStake = reward - treasuryFee;
		IValidatorShare validatorShare = IValidatorShare(
			stakeManager.getValidatorContract(_validatorId)
		);

		_pol
			? validatorShare.buyVoucherPOL(amountToStake, 0)
			: validatorShare.buyVoucher(amountToStake, 0);

		uint256 totalShares = totalSupply();
		uint256 totalPooledAmount = getTotalStakeAcrossAllValidators();

		fxStateRootTunnel.sendMessageToChild(
			abi.encode(totalShares, totalPooledAmount)
		);

		emit StakeRewards(_validatorId, amountToStake);
	}

	/// @notice Delegates a given amount of POL tokens to another validator.
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
			validatorRegistry.validatorIdExists(_fromValidatorId),
			"From validator id does not exist in our registry"
		);
		require(
			validatorRegistry.validatorIdExists(_toValidatorId),
			"To validator id does not exist in our registry"
		);

		IValidatorShare validatorShare = IValidatorShare(
			stakeManager.getValidatorContract(_fromValidatorId)
		);
		(uint256 validatorBalance, ) = getTotalStake(validatorShare);

		uint256 finalAmount = _amount > validatorBalance
			? validatorBalance
			: _amount;
		require(finalAmount > 0, "Available delegation amount is zero");

		emit MigrateDelegation(_fromValidatorId, _toValidatorId, finalAmount);

		stakeManager.migrateDelegation(
			_fromValidatorId,
			_toValidatorId,
			finalAmount
		);
	}

	/// ------------------------------ Setters ---------------------------------

	/// @notice Sets a fee percent where 1 = 0.01%.
	/// @param _feePercent - Fee percent
	// slither-disable-next-line reentrancy-eth
	function setFeePercent(
		uint16 _feePercent
	) external override nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
		require(_feePercent <= MAX_FEE_PERCENT, "Fee percent is too high");

		uint256[] memory validatorIds = validatorRegistry.getValidators();
		uint256 validatorIdCount = validatorIds.length;

		for (uint256 i = 0; i < validatorIdCount; ) {
			_stakeRewardsAndDistributeFees(validatorIds[i], true, false);

			unchecked {
				++i;
			}
		}

		feePercent = _feePercent;
		emit SetFeePercent(_feePercent);
	}

	/// @notice Sets the address of the treasury.
	/// @param _treasury - Address of the treasury
	function setTreasury(
		address _treasury
	) external override onlyRole(DEFAULT_ADMIN_ROLE) {
		require(_treasury != address(0), "Zero treasury address");

		treasury = _treasury;
		emit SetTreasury(_treasury);
	}

	/// @notice Sets the address of the validator registry.
	/// @param _validatorRegistry - Address of the validator registry
	function setValidatorRegistry(
		address _validatorRegistry
	) external override onlyRole(DEFAULT_ADMIN_ROLE) {
		require(
			_validatorRegistry != address(0),
			"Zero validator registry address"
		);

		validatorRegistry = IValidatorRegistry(_validatorRegistry);
		emit SetValidatorRegistry(_validatorRegistry);
	}

	/// @notice Sets the address of the fx state root tunnel.
	/// @param _fxStateRootTunnel - Address of the fx state root tunnel
	function setFxStateRootTunnel(
		address _fxStateRootTunnel
	) external override onlyRole(DEFAULT_ADMIN_ROLE) {
		require(
			_fxStateRootTunnel != address(0),
			"Zero fx state root tunnel address"
		);

		fxStateRootTunnel = IFxStateRootTunnel(_fxStateRootTunnel);
		emit SetFxStateRootTunnel(_fxStateRootTunnel);
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

	/// @notice Toggles the paused status of this contract.
	function togglePause() external override onlyRole(DEFAULT_ADMIN_ROLE) {
		paused() ? _unpause() : _pause();
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
		if (totalPooledAmount == 0) {
			totalPooledAmount = 1;
		}

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
		if (totalPooledAmount == 0) {
			totalPooledAmount = 1;
		}

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
		uint256[] memory validators = validatorRegistry.getValidators();
		uint256 validatorCount = validators.length;
		uint256 totalValidatorStake;

		for (uint256 i = 0; i < validatorCount; ) {
			address validatorShare = IStakeManager(stakeManager)
				.getValidatorContract(validators[i]);
			(uint256 validatorStake, ) = getTotalStake(
				IValidatorShare(validatorShare)
			);

			totalValidatorStake += validatorStake;

			unchecked {
				++i;
			}
		}

		return totalValidatorStake;
	}

	/// @notice Returns total pooled POL tokens from all registered validators.
	/// @custom:deprecated
	/// @return Total pooled POL tokens
	function getTotalPooledMatic() external view override returns (uint256) {
		return getTotalStakeAcrossAllValidators();
	}

	/// @notice Returns the total amount of staked POL tokens and their exchange
	/// rate for the current contract on the given validator share.
	/// @param _validatorShare - Address of the validator share
	/// @return Total amount of staked POL tokens
	/// @return Exchange rate
	function getTotalStake(
		IValidatorShare _validatorShare
	) public view override returns (uint256, uint256) {
		return _validatorShare.getTotalStake(address(this));
	}

	/// @notice Returns all withdrawal requests initiated by the user.
	/// @param _user - Address of the user
	/// @return Array of user's withdrawal requests
	function getUserWithdrawalRequests(
		address _user
	) external view override returns (WithdrawalRequest[] memory) {
		return userWithdrawalRequests[_user];
	}

	/// @dev Returns a shares amount of the withdrawal request.
	/// @param _user - Address of the user
	/// @param _idx Index of the withdrawal request
	/// @return Share amount fo the withdrawal request
	function getSharesAmountOfUserWithdrawalRequest(
		address _user,
		uint256 _idx
	) external view override returns (uint256) {
		WithdrawalRequest[] memory userRequests = userWithdrawalRequests[_user];
		require(
			_idx < userRequests.length,
			"Withdrawal request does not exist"
		);

		WithdrawalRequest memory userRequest = userRequests[_idx];
		IValidatorShare.DelegatorUnbond memory unbond = IValidatorShare(
			userRequest.validatorAddress
		).unbonds_new(address(this), userRequest.validatorNonce);

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
			IStakeManager _stakeManager,
			IERC20Upgradeable _maticToken,
			IValidatorRegistry _validatorRegistry,
			IERC20Upgradeable _polToken
		)
	{
		_stakeManager = stakeManager;
		_maticToken = maticToken;
		_validatorRegistry = validatorRegistry;
		_polToken = polToken;
	}
}
