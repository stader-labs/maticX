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

contract MaticX is
	IMaticX,
	ERC20Upgradeable,
	AccessControlUpgradeable,
	PausableUpgradeable
{
	// TODO: Refactor public/private and orders before real deploy
	using SafeERC20Upgradeable for IERC20Upgradeable;

	IValidatorRegistry public override validatorRegistry;
	IStakeManager public stakeManager;
	FeeDistribution public override entityFees;

	string public override version;
	// address to accrue revenue
	address public treasury;
	// address to cover for funds insurance.
	address public override insurance;
	address public override token;
	address public proposed_manager;
	address public manager;

	/// @notice Mapping of all user ids with withdraw requests.
	mapping(address => WithdrawalRequest[]) private userWithdrawalRequests;

	bytes32 public constant INSTANT_POOL_OWNER = keccak256("IPO");

	uint8 public override feePercent;
	address public instantPoolOwner;
	uint256 public instantPoolMatic;
	uint256 public instantPoolMaticX;

	/**
	 * @param _validatorRegistry - Address of the validator registry
	 * @param _stakeManager - Address of the stake manager
	 * @param _token - Address of matic token on Ethereum Mainnet
	 * @param _treasury - Address of the treasury
	 * @param _insurance - Address of the insurance
	 */
	function initialize(
		address _validatorRegistry,
		address _stakeManager,
		address _token,
		address _manager,
		address _instantPoolOwner,
		address _treasury,
		address _insurance
	) external override initializer {
		__AccessControl_init();
		__Pausable_init();
		__ERC20_init("Liquid Staking Matic Test", "tMaticX");

		_setupRole(DEFAULT_ADMIN_ROLE, _manager);
		manager = _manager;
		_setupRole(INSTANT_POOL_OWNER, _instantPoolOwner);
		instantPoolOwner = _instantPoolOwner;

		validatorRegistry = IValidatorRegistry(_validatorRegistry);
		stakeManager = IStakeManager(_stakeManager);
		treasury = _treasury;
		token = _token;
		insurance = _insurance;

		entityFees = FeeDistribution(100, 0);
		feePercent = 5;
	}

	////////////////////////////////////////////////////////////
	/////                                                    ///
	/////             ***Instant Pool Interactions***        ///
	/////                                                    ///
	////////////////////////////////////////////////////////////

	// Uses instantPoolOwner funds.
	function provideInstantPoolMatic(uint256 _amount)
		external
		override
		whenNotPaused
		onlyRole(INSTANT_POOL_OWNER)
	{
		require(_amount > 0, "Invalid amount");
		IERC20Upgradeable(token).safeTransferFrom(
			msg.sender,
			address(this),
			_amount
		);

		instantPoolMatic += _amount;
	}

	function provideInstantPoolMaticX(uint256 _amount)
		external
		override
		whenNotPaused
		onlyRole(INSTANT_POOL_OWNER)
	{
		require(_amount > 0, "Invalid amount");
		IERC20Upgradeable(address(this)).safeTransferFrom(
			msg.sender,
			address(this),
			_amount
		);

		instantPoolMaticX += _amount;
	}

	function withdrawInstantPoolMaticX(uint256 _amount)
		external
		override
		whenNotPaused
		onlyRole(INSTANT_POOL_OWNER)
	{
		require(
			instantPoolMaticX >= _amount,
			"Withdraw amount cannot exceed maticX in instant pool"
		);

		instantPoolMaticX -= _amount;
		IERC20Upgradeable(address(this)).safeTransfer(
			instantPoolOwner,
			_amount
		);
	}

	function withdrawInstantPoolMatic(uint256 _amount)
		external
		override
		whenNotPaused
		onlyRole(INSTANT_POOL_OWNER)
	{
		require(
			instantPoolMatic >= _amount,
			"Withdraw amount cannot exceed matic in instant pool"
		);

		instantPoolMatic -= _amount;
		IERC20Upgradeable(token).safeTransfer(instantPoolOwner, _amount);
	}

	// Uses instantPoolMatic funds
	function mintMaticXToInstantPool()
		external
		override
		whenNotPaused
		onlyRole(INSTANT_POOL_OWNER)
	{
		require(instantPoolMatic > 0, "Matic amount cannot be 0");

		uint256 maticxMinted = helper_delegate_to_mint(
			address(this),
			instantPoolMatic
		);
		instantPoolMaticX += maticxMinted;
		instantPoolMatic = 0;
	}

	function swapMaticForMaticXViaInstantPool(uint256 _amount)
		external
		override
		whenNotPaused
	{
		require(_amount > 0, "Invalid amount");
		IERC20Upgradeable(token).safeTransferFrom(
			msg.sender,
			address(this),
			_amount
		);

		(uint256 amountToMint, , ) = convertMaticToMaticX(_amount);
		require(
			instantPoolMaticX >= amountToMint,
			"Not enough maticX to instant swap"
		);

		IERC20Upgradeable(address(this)).safeTransfer(msg.sender, amountToMint);
		instantPoolMatic += _amount;
		instantPoolMaticX -= amountToMint;
	}

	////////////////////////////////////////////////////////////
	/////                                                    ///
	/////             ***Staking Contract Interactions***    ///
	/////                                                    ///
	////////////////////////////////////////////////////////////

	/**
	 * @dev Send funds to MaticX contract and mints MaticX to msg.sender
	 * @notice Requires that msg.sender has approved _amount of MATIC to this contract
	 * @param _amount - Amount of MATIC sent from msg.sender to this contract
	 * @return Amount of MaticX shares generated
	 */
	function submit(uint256 _amount)
		external
		override
		whenNotPaused
		returns (uint256)
	{
		require(_amount > 0, "Invalid amount");

		IERC20Upgradeable(token).safeTransferFrom(
			msg.sender,
			address(this),
			_amount
		);

		return helper_delegate_to_mint(msg.sender, _amount);
	}

	// TODO: Find better way to do it
	function safeApprove() external {
		IERC20Upgradeable(token).safeApprove(
			address(stakeManager),
			type(uint256).max
		);
	}

	/**
	 * @dev Stores user's request to withdraw into WithdrawalRequest struct
	 * @param _amount - Amount of maticX that is requested to withdraw
	 */
	function requestWithdraw(uint256 _amount) external override whenNotPaused {
		require(_amount > 0, "Invalid amount");

		(uint256 totalAmount2WithdrawInMatic, , ) = convertMaticXToMatic(
			_amount
		);

		_burn(msg.sender, _amount);

		uint256 leftAmount2WithdrawInMatic = totalAmount2WithdrawInMatic;
		uint256 totalDelegated = getTotalStakeAcrossAllValidators();

		require(
			totalDelegated >= totalAmount2WithdrawInMatic,
			"Too much to withdraw"
		);

		uint256[] memory validators = validatorRegistry.getValidators();
		uint256 preferredValidatorId = validatorRegistry
			.getPreferredWithdrawalValidatorId();
		uint256 currentIdx = 0;
		for (; currentIdx < validators.length; ++currentIdx) {
			if (preferredValidatorId == validators[currentIdx]) break;
		}

		while (leftAmount2WithdrawInMatic > 0) {
			uint256 validatorId = validators[currentIdx];

			address validatorShare = stakeManager.getValidatorContract(
				validatorId
			);
			(uint256 validatorBalance, ) = getTotalStake(
				IValidatorShare(validatorShare)
			);

			uint256 amount2WithdrawFromValidator = (validatorBalance <=
				leftAmount2WithdrawInMatic)
				? validatorBalance
				: leftAmount2WithdrawInMatic;

			IValidatorShare(validatorShare).sellVoucher_new(
				amount2WithdrawFromValidator,
				type(uint256).max
			);

			userWithdrawalRequests[msg.sender].push(
				WithdrawalRequest(
					IValidatorShare(validatorShare).unbondNonces(address(this)),
					stakeManager.epoch() + stakeManager.withdrawalDelay(),
					validatorShare
				)
			);

			leftAmount2WithdrawInMatic -= amount2WithdrawFromValidator;
			currentIdx = currentIdx + 1 < validators.length
				? currentIdx + 1
				: 0;
		}

		emit RequestWithdraw(msg.sender, _amount, totalAmount2WithdrawInMatic);
	}

	/**
	 * @dev Claims tokens from validator share and sends them to the
	 * address if the request is in the userWithdrawalRequests
	 * @param _idx - User withdrawal request array index
	 */
	function claimWithdrawal(uint256 _idx) external override whenNotPaused {
		_claimWithdrawal(msg.sender, _idx);
	}

	function withdrawRewards(uint256 _validatorId)
		public
		override
		whenNotPaused
		returns (uint256)
	{
		address validatorShare = stakeManager.getValidatorContract(
			_validatorId
		);

		uint256 balanceBeforeRewards = IERC20Upgradeable(token).balanceOf(
			address(this)
		);
		IValidatorShare(validatorShare).withdrawRewards();
		uint256 rewards = IERC20Upgradeable(token).balanceOf(address(this)) -
			balanceBeforeRewards;

		emit WithdrawRewards(_validatorId, rewards);

		return rewards;
	}

	function stakeRewardsAndDistributeFees(uint256 _validatorId)
		external
		override
		whenNotPaused
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		require(
			validatorRegistry.isRegisteredValidatorId(_validatorId),
			"Doesn't exist in validator registry"
		);

		address validatorShare = stakeManager.getValidatorContract(
			_validatorId
		);

		uint256 rewards = IERC20Upgradeable(token).balanceOf(address(this)) -
			instantPoolMatic;

		require(rewards > 0, "Reward is zero");

		uint256 treasuryFees = (rewards * feePercent * entityFees.treasury) /
			10000;
		uint256 insuranceFees = (rewards * feePercent * entityFees.insurance) /
			10000;

		if (treasuryFees > 0) {
			IERC20Upgradeable(token).safeTransfer(treasury, treasuryFees);
			emit DistributeFees(treasury, treasuryFees);
		}

		if (insuranceFees > 0) {
			IERC20Upgradeable(token).safeTransfer(insurance, insuranceFees);
			emit DistributeFees(insurance, insuranceFees);
		}

		uint256 amountStaked = rewards - treasuryFees - insuranceFees;
		IValidatorShare(validatorShare).buyVoucher(amountStaked, 0);

		emit StakeRewards(_validatorId, amountStaked);
	}

	/**
	 * @dev Migrate the staked tokens to another validaor
	 */
	function migrateDelegation(
		uint256 _fromValidatorId,
		uint256 _toValidatorId,
		uint256 _amount
	) external override whenNotPaused onlyRole(DEFAULT_ADMIN_ROLE) {
		require(
			validatorRegistry.isRegisteredValidatorId(_fromValidatorId),
			"From validator id does not exist in our registry"
		);
		require(
			validatorRegistry.isRegisteredValidatorId(_toValidatorId),
			"To validator id does not exist in our registry"
		);

		stakeManager.migrateDelegation(
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

	function helper_delegate_to_mint(address deposit_sender, uint256 _amount)
		internal
		whenNotPaused
		returns (uint256)
	{
		(uint256 amountToMint, , ) = convertMaticToMaticX(_amount);

		_mint(deposit_sender, amountToMint);
		emit Submit(deposit_sender, _amount);

		uint256 preferredValidatorId = validatorRegistry
			.getPreferredDepositValidatorId();
		address validatorShare = stakeManager.getValidatorContract(
			preferredValidatorId
		);
		IValidatorShare(validatorShare).buyVoucher(_amount, 0);

		emit Delegate(preferredValidatorId, _amount);
		return amountToMint;
	}

	/**
	 * @dev Claims tokens from validator share and sends them to the
	 * address if the request is in the userWithdrawalRequests
	 * @param _to - Address of the withdrawal request owner
	 * @param _idx - User withdrawal request array index
	 */
	function _claimWithdrawal(address _to, uint256 _idx)
		internal
		returns (uint256)
	{
		uint256 amountToClaim = 0;
		uint256 balanceBeforeClaim = IERC20Upgradeable(token).balanceOf(
			address(this)
		);
		WithdrawalRequest[] storage userRequests = userWithdrawalRequests[_to];
		WithdrawalRequest memory userRequest = userRequests[_idx];
		require(
			stakeManager.epoch() >= userRequest.requestEpoch,
			"Not able to claim yet"
		);

		IValidatorShare(userRequest.validatorAddress).unstakeClaimTokens_new(
			userRequest.validatorNonce
		);

		// swap with the last item and pop it.
		userRequests[_idx] = userRequests[userRequests.length - 1];
		userRequests.pop();

		amountToClaim =
			IERC20Upgradeable(token).balanceOf(address(this)) -
			balanceBeforeClaim;

		IERC20Upgradeable(token).safeTransfer(_to, amountToClaim);

		emit ClaimWithdrawal(_to, _idx, amountToClaim);

		return amountToClaim;
	}

	/**
	 * @dev Function that converts arbitrary maticX to Matic
	 * @param _balance - Balance in maticX
	 * @return Balance in Matic, totalShares and totalPooledMATIC
	 */
	function convertMaticXToMatic(uint256 _balance)
		public
		view
		override
		returns (
			uint256,
			uint256,
			uint256
		)
	{
		uint256 totalShares = totalSupply();
		totalShares = totalShares == 0 ? 1 : totalShares;

		uint256 totalPooledMATIC = getTotalPooledMatic();
		totalPooledMATIC = totalPooledMATIC == 0 ? 1 : totalPooledMATIC;

		uint256 balanceInMATIC = (_balance * (totalPooledMATIC)) / totalShares;

		return (balanceInMATIC, totalShares, totalPooledMATIC);
	}

	/**
	 * @dev Function that converts arbitrary Matic to maticX
	 * @param _balance - Balance in Matic
	 * @return Balance in maticX, totalShares and totalPooledMATIC
	 */
	function convertMaticToMaticX(uint256 _balance)
		public
		view
		override
		returns (
			uint256,
			uint256,
			uint256
		)
	{
		uint256 totalShares = totalSupply();
		totalShares = totalShares == 0 ? 1 : totalShares;

		uint256 totalPooledMatic = getTotalPooledMatic();
		totalPooledMatic = totalPooledMatic == 0 ? 1 : totalPooledMatic;

		uint256 balanceInMaticX = (_balance * totalShares) / totalPooledMatic;

		return (balanceInMaticX, totalShares, totalPooledMatic);
	}

	////////////////////////////////////////////////////////////
	/////                                                    ///
	/////                 ***Setters***                      ///
	/////                                                    ///
	////////////////////////////////////////////////////////////

	/**
	 * @dev Function that sets entity fees
	 * @notice Callable only by manager
	 * @param _treasuryFee - Treasury fee in %
	 * @param _insuranceFee - Insurance fee in %
	 */
	function setFees(uint8 _treasuryFee, uint8 _insuranceFee)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		require(
			_treasuryFee + _insuranceFee == 100,
			"sum(fee) is not equal to 100"
		);
		entityFees.treasury = _treasuryFee;
		entityFees.insurance = _insuranceFee;

		emit SetFees(_treasuryFee, _insuranceFee);
	}

	/**
	 * @dev Function that sets fee percent
	 * @notice Callable only by manager
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

	function setInstantPoolOwner(address _address)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		instantPoolOwner = _address;
		_setupRole(INSTANT_POOL_OWNER, _address);

		emit SetInstantPoolOwner(_address);
	}

	/**
	 * @dev Function that sets new manager address
	 * @notice Callable only by manager
	 * @param _address - New manager address
	 */
	function setTreasuryAddress(address _address)
		external
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		treasury = _address;

		emit SetTreasuryAddress(_address);
	}

	/**
	 * @dev Function that sets new insurance address
	 * @notice Callable only by manager
	 * @param _address - New insurance address
	 */
	function setInsuranceAddress(address _address)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		insurance = _address;

		emit SetInsuranceAddress(_address);
	}

	/**
	 * @dev Function that sets new validator registry address
	 * @notice Only callable by manager
	 * @param _address - New validator registry address
	 */
	function setValidatorRegistryAddress(address _address)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		validatorRegistry = IValidatorRegistry(_address);

		emit SetValidatorRegistryAddress(_address);
	}

	/**
	 * @dev Function that sets the new version
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

	////////////////////////////////////////////////////////////
	/////                                                    ///
	/////                 ***Getters***                      ///
	/////                                                    ///
	////////////////////////////////////////////////////////////

	/**
	 * @dev Helper function for that returns total pooled MATIC
	 * @return Total pooled MATIC
	 */
	function getTotalStakeAcrossAllValidators()
		public
		view
		override
		returns (uint256)
	{
		uint256 totalStake;
		uint256[] memory validators = validatorRegistry.getValidators();
		for (uint256 i = 0; i < validators.length; ++i) {
			address validatorShare = stakeManager.getValidatorContract(
				validators[i]
			);
			(uint256 currValidatorShare, ) = getTotalStake(
				IValidatorShare(validatorShare)
			);

			totalStake += currValidatorShare;
		}

		return totalStake;
	}

	/**
	 * @dev Function that calculates total pooled Matic
	 * @return Total pooled Matic
	 */
	function getTotalPooledMatic() public view override returns (uint256) {
		uint256 totalStaked = getTotalStakeAcrossAllValidators();
		return totalStaked;
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

	function getInstantPoolMatic() external view override returns (uint256) {
		return instantPoolMatic;
	}

	function getInstantPoolMaticX() external view override returns (uint256) {
		return instantPoolMaticX;
	}
}
