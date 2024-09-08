// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import "./interfaces/IValidatorShare.sol";
import "./interfaces/IValidatorRegistry.sol";
import "./interfaces/IStakeManager.sol";
import "./interfaces/IMaticX.sol";
import "./interfaces/IFxStateRootTunnel.sol";

/// @title MaticX
/// @notice MaticX is the main contract that manages staking and unstaking of MATIC
contract MaticX is
	IMaticX,
	ERC20Upgradeable,
	AccessControlUpgradeable,
	PausableUpgradeable
{
	using SafeERC20Upgradeable for IERC20Upgradeable;

	bytes32 public constant PREDICATE_ROLE = keccak256("PREDICATE_ROLE");
	bytes32 public constant BOT = keccak256("BOT");

	address private validatorRegistry;
	address private stakeManager;
	address private maticToken;

	address public override treasury;
	string public override version;
	uint8 public override feePercent;

	address public instantPoolOwner_deprecated;
	uint256 public instantPoolMatic_deprecated;
	uint256 public instantPoolMaticX_deprecated;

	/// @notice Mapping of all user ids with withdraw requests.
	mapping(address => WithdrawalRequest[]) private userWithdrawalRequests;

	address public override fxStateRootTunnel;
	address private polToken;

	/**
	 * @dev Initializes the current contract.
	 * @param _validatorRegistry - Address of the validator registry
	 * @param _stakeManager - Address of the stake manager
	 * @param _maticToken - Address of the MATIC token
	 * @param _manager - Address of the manager
	 * @param _treasury - Address of the treasury
	*/
	function initialize(
		address _validatorRegistry,
		address _stakeManager,
		address _maticToken,
		address _manager,
		address _treasury
	) external initializer {
		__AccessControl_init();
		__Pausable_init();
		__ERC20_init("Liquid Staking Matic", "MaticX");

		_setupRole(DEFAULT_ADMIN_ROLE, _manager);

		validatorRegistry = _validatorRegistry;
		stakeManager = _stakeManager;
		treasury = _treasury;
		maticToken = _maticToken;
		feePercent = 5;

		IERC20Upgradeable(maticToken).safeApprove(
			stakeManager,
			type(uint256).max
		);
	}

	/**
	 * @dev Sets the BOT's admin role.
	 * @notice Callable by the admin only.
	 */
	function setupBotAdmin()
		external
		override
		whenNotPaused
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		_setRoleAdmin(BOT, DEFAULT_ADMIN_ROLE);
	}

	////////////////////////////////////////////////////////////
	/////                                                    ///
	/////             ***Staking Contract Interactions***    ///
	/////                                                    ///
	////////////////////////////////////////////////////////////

	/**
	 * @dev Sends MATIC tokens to the current contract and mints MaticX to the
	 * sender.
	 * @notice Requires that the sender has approved _amount of MATIC to this
	 * contract.
	 * @param _amount - Amount of MATIC sent from the sender to this contract
	 * @return Amount of MaticX shares generated
	 */
	function submit(uint256 _amount)
		external
		override
		whenNotPaused
		returns (uint256)
	{
		return _submit(msg.sender, _amount, false);
	}

	/**
	 * @dev Sends POL tokens to the current contract and mints MaticX to the
	 * sender.
	 * @notice Requires that the sender has approved _amount of POL to this
	 * contract.
	 * @param _amount - Amount of POL sent from the sender to this contract
	 * @return Amount of MaticX shares generated
	 */
	function submitPOL(uint256 _amount)
		external
		override
		whenNotPaused
		returns (uint256)
	{
		return _submit(msg.sender, _amount, true);
	}

	/**
	 * @dev Sends tokens to the current contract and mints MaticX to the sender.
	 * @param depositSender - Address of the user that is depositing
	 * @param _amount - Amount of tokens sent from msg.sender to this contract
	 * @param _pol - If the POL related flow should be applied
	 * @return Amount of MaticX shares generated
	 */
	function _submit(address depositSender, uint256 _amount, bool _pol)
		internal
		returns (uint256)
	{
		require(_amount > 0, "Invalid amount");

		address token = _getToken(_pol);
		IERC20Upgradeable(token).safeTransferFrom(
			msg.sender,
			address(this),
			_amount
		);

		(
			uint256 mintedAmount,
			uint256 totalShares,
			uint256 totalPooledStakeTokens
		) = _convertStakeTokenToMaticX(_amount);

		_mint(depositSender, mintedAmount);
		emit Submit(depositSender, _amount);

		uint256 preferredValidatorId = IValidatorRegistry(validatorRegistry)
			.preferredDepositValidatorId();
		address validatorShare = IStakeManager(stakeManager)
			.getValidatorContract(preferredValidatorId);

		_pol
			? IValidatorShare(validatorShare).buyVoucherPOL(_amount, 0)
			: IValidatorShare(validatorShare).buyVoucher(_amount, 0);

		IFxStateRootTunnel(fxStateRootTunnel).sendMessageToChild(
			abi.encode(totalShares + mintedAmount, totalPooledStakeTokens + _amount)
		);

		emit Delegate(preferredValidatorId, _amount);
		return mintedAmount;
	}

	/**
	 * @dev Stores user's request to withdraw MATIC tokens in the WithdrawalRequest
	 * struct.
	 * @param _amount - Amount of Matic that is requested to withdraw
	 */
	function requestWithdraw(uint256 _amount) external override whenNotPaused {
		_requestWithdraw(_amount, false);
	}

	/**
	 * @dev Stores user's request to withdraw POL tokens in the WithdrawalRequest
	 * struct.
	 * @param _amount - Amount of POL that is requested to withdraw
	 */
	function requestWithdrawPOL(uint256 _amount) external override whenNotPaused {
		_requestWithdraw(_amount, true);
	}

	/**
	 * @dev Stores user's request to withdraw tokens in the WithdrawalRequest
	 * struct.
	 * @param _amount - Amount of POL that is requested to withdraw
	 * @param _pol - If the POL related flow should be applied
	 */
	function _requestWithdraw(uint256 _amount, bool _pol) internal {
		require(_amount > 0, "Invalid amount");

		(
			uint256 totalAmount2WithdrawInMatic,
			uint256 totalShares,
			uint256 totalPooledStakeTokens
		) = _convertMaticXToStakeToken(_amount);

		_burn(msg.sender, _amount);

		uint256 leftAmount2WithdrawInMatic = totalAmount2WithdrawInMatic;
		uint256 totalDelegated = getTotalStakeAcrossAllValidators();

		require(
			totalDelegated >= totalAmount2WithdrawInMatic,
			"Too much to withdraw"
		);

		uint256[] memory validators = IValidatorRegistry(validatorRegistry)
			.getValidators();
		uint256 preferredValidatorId = IValidatorRegistry(validatorRegistry)
			.preferredWithdrawalValidatorId();
		uint256 currentIdx = 0;
		for (; currentIdx < validators.length; ++currentIdx) {
			if (preferredValidatorId == validators[currentIdx]) break;
		}

		while (leftAmount2WithdrawInMatic > 0) {
			uint256 validatorId = validators[currentIdx];

			address validatorShare = IStakeManager(stakeManager)
				.getValidatorContract(validatorId);
			(uint256 validatorBalance, ) = getTotalStake(
				IValidatorShare(validatorShare)
			);

			uint256 amount2WithdrawFromValidator = (validatorBalance <=
				leftAmount2WithdrawInMatic)
				? validatorBalance
				: leftAmount2WithdrawInMatic;

			_pol
				? IValidatorShare(validatorShare).sellVoucher_newPOL(
					amount2WithdrawFromValidator,
					type(uint256).max
				)
				: IValidatorShare(validatorShare).sellVoucher_new(
					amount2WithdrawFromValidator,
					type(uint256).max
				);

			userWithdrawalRequests[msg.sender].push(
				WithdrawalRequest(
					IValidatorShare(validatorShare).unbondNonces(address(this)),
					IStakeManager(stakeManager).epoch() +
						IStakeManager(stakeManager).withdrawalDelay(),
					validatorShare
				)
			);

			leftAmount2WithdrawInMatic -= amount2WithdrawFromValidator;
			currentIdx = currentIdx + 1 < validators.length
				? currentIdx + 1
				: 0;
		}

		IFxStateRootTunnel(fxStateRootTunnel).sendMessageToChild(
			abi.encode(
				totalShares - _amount,
				totalPooledStakeTokens - totalAmount2WithdrawInMatic
			)
		);

		emit RequestWithdraw(msg.sender, _amount, totalAmount2WithdrawInMatic);
	}

	/**
	 * @dev Claims MATIC tokens from a validator share and sends them to the
	 * address if the request is in the withdrawalRequest struct for a user.
	 * @param _idx - User withdrawal request array index
	 */
	function claimWithdrawal(uint256 _idx) external override whenNotPaused {
		_claimWithdrawal(msg.sender, _idx, false);
	}

	/**
	 * @dev Claims POL tokens from a validator share and sends them to the
	 * address if the request is in the withdrawalRequest struct for a user.
	 * @param _idx - User withdrawal request array index
	 */
	function claimWithdrawalPOL(uint256 _idx) external override whenNotPaused {
		_claimWithdrawal(msg.sender, _idx, true);
	}

	/**
	 * @dev Claims tokens from validator share and sends them to the address if
	 * the request is in the withdrawalRequest struct for a user.
	 * @param _to - Address of the withdrawal request owner
	 * @param _idx - User withdrawal request array index
	 * @param _pol - If the POL related flow should be applied
	 */
	function _claimWithdrawal(address _to, uint256 _idx, bool _pol)
		internal
		returns (uint256)
	{
		address token = _getToken(_pol);
		uint256 balanceBeforeClaim = IERC20Upgradeable(token).balanceOf(
			address(this)
		);

		WithdrawalRequest[] storage userRequests = userWithdrawalRequests[_to];
		WithdrawalRequest memory userRequest = userRequests[_idx];
		require(
			IStakeManager(stakeManager).epoch() >= userRequest.requestEpoch,
			"Not able to claim yet"
		);

		_pol
			? IValidatorShare(userRequest.validatorAddress)
				.unstakeClaimTokens_newPOL(userRequest.validatorNonce)
			: IValidatorShare(userRequest.validatorAddress)
				.unstakeClaimTokens_new(userRequest.validatorNonce);

		// swap with the last item and pop it.
		userRequests[_idx] = userRequests[userRequests.length - 1];
		userRequests.pop();

		uint256 amountToClaim =
			IERC20Upgradeable(token).balanceOf(address(this)) -
			balanceBeforeClaim;

		IERC20Upgradeable(token).safeTransfer(_to, amountToClaim);

		emit ClaimWithdrawal(_to, _idx, amountToClaim);
		return amountToClaim;
	}

	/**
	 * @dev This function is deprecated. Please use withdrawValidatorsReward instead.
	 * @param _validatorId - Validator id to withdraw rewards
	 */
	function withdrawRewards(uint256 _validatorId)
		public
		override
		whenNotPaused
		returns (uint256)
	{
		return _withdrawRewards(_validatorId, false);
	}

	/**
	 * @dev Withdraw MATIC rewards for given validators.
	 * @param _validatorIds - Array of validator ids to withdraw MATIC rewards for
	 */
	function withdrawValidatorsReward(uint256[] calldata _validatorIds)
		public
		override
		whenNotPaused
		returns (uint256[] memory)
	{
		uint256[] memory rewards = new uint256[](_validatorIds.length);
		for (uint256 i = 0; i < _validatorIds.length; i++) {
			rewards[i] = _withdrawRewards(_validatorIds[i], false);
		}
		return rewards;
	}

	/**
	 * @dev Withdraw POL rewards for given validators.
	 * @param _validatorIds - Array of validator ids to withdraw POL rewards for
	 */
	function withdrawValidatorsRewardPOL(uint256[] calldata _validatorIds)
		public
		override
		whenNotPaused
		returns (uint256[] memory)
	{
		uint256[] memory rewards = new uint256[](_validatorIds.length);
		for (uint256 i = 0; i < _validatorIds.length; i++) {
			rewards[i] = _withdrawRewards(_validatorIds[i], true);
		}
		return rewards;
	}

	/**
	 * @dev Withdraw rewards for a given validator.
	 * @param _validatorId - Validator id to withdraw rewards for
	 * @param _pol - If the POL related flow should be applied
	 */
	function _withdrawRewards(uint256 _validatorId, bool _pol) internal returns (uint256) {
		address validatorShare = IStakeManager(stakeManager)
			.getValidatorContract(_validatorId);

		address token = _getToken(_pol);
		uint256 balanceBeforeRewards = IERC20Upgradeable(token)
			.balanceOf(address(this));

		_pol
			? IValidatorShare(validatorShare).withdrawRewardsPOL()
			: IValidatorShare(validatorShare).withdrawRewards();

		uint256 rewards = IERC20Upgradeable(token).balanceOf(
			address(this)
		) - balanceBeforeRewards;

		emit WithdrawRewards(_validatorId, rewards);
		return rewards;
	}

	/**
	 * @dev Stake MATIC rewards and distribute fees to a treasury. Only callable
	 * by BOT.
	 * @param _validatorId - Validator id to stake rewards and distribute fees
	 */
	function stakeRewardsAndDistributeFees(uint256 _validatorId)
		external
		override
		whenNotPaused
		onlyRole(BOT)
	{
		_stakeRewardsAndDistributeFees(_validatorId, false);
	}

	/**
	 * @dev Stake POL rewards and distribute fees to a treasury. Only callable
	 * by BOT.
	 * @param _validatorId - Validator id to stake rewards and distribute fees
	 */
	function stakeRewardsAndDistributeFeesPOL(uint256 _validatorId)
		external
		override
		whenNotPaused
		onlyRole(BOT)
	{
		_stakeRewardsAndDistributeFees(_validatorId, true);
	}

	/**
	 * @dev Stake rewards and distribute fees to a treasury.
	 * @param _validatorId - Validator id to stake rewards and distribute fees
	 * @param _pol - If the POL related flow should be applied
	 */
	function _stakeRewardsAndDistributeFees(uint256 _validatorId, bool _pol) internal {
		require(
			IValidatorRegistry(validatorRegistry).validatorIdExists(
				_validatorId
			),
			"Doesn't exist in validator registry"
		);

		address token = _getToken(_pol);
		address validatorShare = IStakeManager(stakeManager)
			.getValidatorContract(_validatorId);

		uint256 rewards = IERC20Upgradeable(token).balanceOf(
			address(this)
		); // TODO Consider this case: `- instantPoolMatic_deprecated`;
		require(rewards > 0, "Reward is zero");

		uint256 treasuryFees = (rewards * feePercent) / 100;

		if (treasuryFees > 0) {
			IERC20Upgradeable(token).safeTransfer(
				treasury,
				treasuryFees
			);
			emit DistributeFees(treasury, treasuryFees);
		}

		uint256 amountStaked = rewards - treasuryFees;
		_pol
			? IValidatorShare(validatorShare).buyVoucherPOL(amountStaked, 0)
			: IValidatorShare(validatorShare).buyVoucher(amountStaked, 0);

		uint256 totalShares = totalSupply();
		uint256 totalPooledStakeTokens = getTotalPooledStakeTokens();

		IFxStateRootTunnel(fxStateRootTunnel).sendMessageToChild(
			abi.encode(totalShares, totalPooledStakeTokens)
		);

		emit StakeRewards(_validatorId, amountStaked);
	}

	/**
	 * @dev Migrate all staked tokens to another validator.
	 * @notice Callable by the admin only.
	 */
	function migrateDelegation(
		uint256 _fromValidatorId,
		uint256 _toValidatorId,
		uint256 _amount
	) external override whenNotPaused onlyRole(DEFAULT_ADMIN_ROLE) {
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

		IStakeManager(stakeManager).migrateDelegation(
			_fromValidatorId,
			_toValidatorId,
			_amount
		);

		emit MigrateDelegation(_fromValidatorId, _toValidatorId, _amount);
	}

	/**
	 * @dev Flips the pause state
	 */
	function togglePause() external override onlyRole(DEFAULT_ADMIN_ROLE) {
		paused() ? _unpause() : _pause();
	}

	/**
	 * @dev API for getting total stake of this contract from validatorShare
	 * @param _validatorShare - Address of validatorShare contract
	 * @return Total stake of this contract and MATIC -> share exchange rate
	 */
	function getTotalStake(IValidatorShare _validatorShare)
		public
		view
		override
		returns (uint256, uint256)
	{
		return _validatorShare.getTotalStake(address(this));
	}

	////////////////////////////////////////////////////////////
	/////                                                    ///
	/////            ***Helpers & Utilities***               ///
	/////                                                    ///
	////////////////////////////////////////////////////////////

	/**
	 * @dev Converts an arbitrary amount of MaticX to stake tokens.
	 * @param _balance - Balance in MaticX
	 * @return Tuple containing a balance in stake tokens, total shares and total
	 * pooled stake tokens
	 */
	function convertMaticXToStakeToken(uint256 _balance)
		external
		view
		override
		returns (
			uint256,
			uint256,
			uint256
		)
	{
		return _convertMaticXToStakeToken(_balance);
	}

	/**
	 * @dev Converts an arbitrary amount of MaticX to stake tokens.
	 * @notice This method is deprecated.
	 * @param _balance - Balance in MaticX
	 * @return Tuple containing a balance in stake tokens, total shares and total
	 * pooled stake tokens
	 */
	function convertMaticXToMatic(uint256 _balance)
		external
		view
		override
		returns (
			uint256,
			uint256,
			uint256
		)
	{
		return _convertMaticXToStakeToken(_balance);
	}

	function _convertMaticXToStakeToken(uint256 _balance)
		private
		view
		returns (
			uint256,
			uint256,
			uint256
			)
	{
		uint256 totalShares = totalSupply();
		totalShares = totalShares == 0 ? 1 : totalShares;

		uint256 totalPooledStakeTokens = getTotalPooledStakeTokens();
		totalPooledStakeTokens = totalPooledStakeTokens == 0 ? 1 : totalPooledStakeTokens;

		uint256 balanceInStakeTokens = (_balance * (totalPooledStakeTokens)) / totalShares;

		return (balanceInStakeTokens, totalShares, totalPooledStakeTokens);
	}

	/**
	 * @dev Converts an arbritrary amount of stake tokens to MaticX.
	 * @param _balance - Balance in a stake token
	 * @return Tuple containing balance in MaticX, total shares and total pooled
	 *  stake tokens
	*/
	function convertStakeTokenToMaticX(uint256 _balance)
		external
		view
		override
		returns (
			uint256,
			uint256,
			uint256
		)
	{
		return _convertStakeTokenToMaticX(_balance);
	}

	/**
	 * @dev Converts an arbritrary amount of stake tokens to MaticX.
	 * @notice This method is deprecated.
	 * @param _balance - Balance in a stake token
	 * @return Tuple containing balance in MaticX, total shares and total pooled
	 *  stake tokens
	*/
	function convertMaticToMaticX(uint256 _balance)
		external
		view
		override
		returns (
			uint256,
			uint256,
			uint256
		)
	{
		return _convertStakeTokenToMaticX(_balance);
	}

	function _convertStakeTokenToMaticX(uint256 _balance)
		private
		view
		returns (
			uint256,
			uint256,
			uint256
		)
	{
		uint256 totalShares = totalSupply();
		totalShares = totalShares == 0 ? 1 : totalShares;

		uint256 totalPooledStakeTokens = getTotalPooledStakeTokens();
		totalPooledStakeTokens = totalPooledStakeTokens == 0 ? 1 : totalPooledStakeTokens;

		uint256 balanceInMaticX = (_balance * totalShares) / totalPooledStakeTokens;

		return (balanceInMaticX, totalShares, totalPooledStakeTokens);
	}

	// TODO: Add logic and enable it in V2
	function mint(address _user, uint256 _amount)
		external
		override
		whenNotPaused
		onlyRole(PREDICATE_ROLE)
	{
		emit MintFromPolygon(_user, _amount);
	}

	////////////////////////////////////////////////////////////
	/////                                                    ///
	/////                 ***Setters***                      ///
	/////                                                    ///
	////////////////////////////////////////////////////////////

	/**
	 * @dev Sets a fee percent.
	 * @notice Callable by the admin only.
	 * @param _feePercent - Fee percent (10 = 10%)
	 */
	function setFeePercent(uint8 _feePercent)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		require(_feePercent <= 100, "_feePercent must not exceed 100");

		feePercent = _feePercent;

		emit SetFeePercent(_feePercent);
	}

	/**
	 * @dev Sets the address of the treasury.
	 * @notice Callable by the admin only.
	 * @param _address Address of the treasury
	 */
	function setTreasury(address _address)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		treasury = _address;

		emit SetTreasury(_address);
	}

	/**
	 * @dev Sets the address of the stake manager.
	 * @notice Callable by the admin only.
	 * @param _address Address of the stake manager
	 */
	function setValidatorRegistry(address _address)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		validatorRegistry = _address;

		emit SetValidatorRegistry(_address);
	}

	/**
	 * @dev Sets the address of the stake manager.
	 * @notice Callable by the admin only.
	 * @param _address Address of the stake manager.
	 */
	function setFxStateRootTunnel(address _address)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		fxStateRootTunnel = _address;

		emit SetFxStateRootTunnel(_address);
	}

	/**
	 * @dev Sets a new version.
	 * @notice Callable by the admin only.
	 * @param _version - New version that will be set
	 */
	function setVersion(string calldata _version)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		version = _version;

		emit SetVersion(_version);
	}

	/**
	 * @dev Sets the address of the POL token.
	 * @notice Callable by the admin only.
	 * @param _address - Address of the POL token
	 */
	function setPOLToken(address _address)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		require(_address != address(0), "Zero POL token address");

		polToken = _address;
		emit SetPOLToken(_address);

		IERC20Upgradeable(polToken).safeApprove(
			stakeManager,
			type(uint256).max
		);
	}

	////////////////////////////////////////////////////////////
	/////                                                    ///
	/////                 ***Getters***                      ///
	/////                                                    ///
	////////////////////////////////////////////////////////////

	/**
	 * @dev Helper function that returns total pooled stake tokens from all
	 * registered validators.
	 * @return Total pooled stake tokens
	 */
	function getTotalStakeAcrossAllValidators()
		public
		view
		override
		returns (uint256)
	{
		uint256 totalStake;
		uint256[] memory validators = IValidatorRegistry(validatorRegistry)
			.getValidators();
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

	/**
	 * @dev Return total pooled stake tokens. This function is deprecated.
	 * @return Total pooled stake tokens
	 */
	function getTotalPooledMatic() public view override returns (uint256) {
		return getTotalStakeAcrossAllValidators();
	}

	/**
	 * @dev Return total pooled stake tokens.
	 * @return Total pooled stake tokens
	 */
	function getTotalPooledStakeTokens() public view override returns (uint256) {
		return getTotalStakeAcrossAllValidators();
	}

	/**
	 * @dev Retrieves all withdrawal requests initiated by the given address
	 * @param _address - Address of an user
	 * @return userWithdrawalRequests array of user withdrawal requests
	 */
	function getUserWithdrawalRequests(address _address)
		external
		view
		override
		returns (WithdrawalRequest[] memory)
	{
		return userWithdrawalRequests[_address];
	}

	/**
	 * @dev Retrieves shares amount of a given withdrawal request
	 * @param _address - Address of an user
	 * @return _idx index of the withdrawal request
	 */
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

	/**
	 * @dev Returns the contract addresses used on the current contract.
	 * @return _stakeManager - Address of the stake manager
	 * @return _maticToken - Address of the MATIC token
	 * @return _validatorRegistry - Address of the validator registry
	 * @return _polToken - Address of the POL token
	 */
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

	/**
	 * @dev Returns the POL or MATIC token depending on a used flow.
	 * @return _token - Address of the token
	 */
	function _getToken(bool pol) private view returns (address) {
		return pol ? polToken : maticToken;
	}
}
