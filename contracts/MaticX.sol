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

	bytes32 public constant INSTANT_POOL_OWNER = keccak256("IPO");
	bytes32 public constant PREDICATE_ROLE = keccak256("PREDICATE_ROLE");
	bytes32 public constant BOT = keccak256("BOT");

	address private validatorRegistry;
	address private stakeManager;
	address private maticToken;

	address public override treasury;
	string public override version;
	uint8 public override feePercent;

	address public override instantPoolOwner;
	uint256 public override instantPoolMatic;
	uint256 public override instantPoolMaticX;

	/// @notice Mapping of all user ids with withdraw requests.
	mapping(address => WithdrawalRequest[]) private userWithdrawalRequests;

	address public override fxStateRootTunnel;
	address private polToken;

	/// @notice Initialize the MaticX contract.
	/// @param _validatorRegistry - Address of the validator registry
	/// @param _stakeManager - Address of the stake manager
	/// @param _maticToken - Address of matic token on Ethereum
	/// @param _manager - Address of the manager
	/// @param _instantPoolOwner - Address of the instant pool owner
	/// @param _treasury - Address of the treasury
	function initialize(
		address _validatorRegistry,
		address _stakeManager,
		address _maticToken,
		address _manager,
		address _instantPoolOwner,
		address _treasury
	) external override initializer {
		__AccessControl_init();
		__Pausable_init();
		__ERC20_init("Liquid Staking Matic", "MaticX");

		_setupRole(DEFAULT_ADMIN_ROLE, _manager);
		_setupRole(INSTANT_POOL_OWNER, _instantPoolOwner);
		instantPoolOwner = _instantPoolOwner;

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

	/// @dev setup BOT as admin of INSTANT_POOL_OWNER
	function setupBotAdmin()
		external
		override
		whenNotPaused
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		_setRoleAdmin(BOT, INSTANT_POOL_OWNER);
	}

	////////////////////////////////////////////////////////////
	/////                                                    ///
	/////             ***Instant Pool Interactions***        ///
	/////                                                    ///
	////////////////////////////////////////////////////////////

	/// @dev provider MATIC from instantPoolOwner to this contract.
	/// @param _amount - Amount of MATIC to be provided
	function provideInstantPoolMatic(uint256 _amount)
		external
		override
		whenNotPaused
		onlyRole(INSTANT_POOL_OWNER)
	{
		require(_amount > 0, "Invalid amount");
		IERC20Upgradeable(maticToken).safeTransferFrom(
			msg.sender,
			address(this),
			_amount
		);

		instantPoolMatic += _amount;
	}

	/// @dev provide MATICX from instantPoolOwner to this contract.
	/// @param _amount - Amount of MATICX to be provided
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

	/// @dev withdraw MATICX from this contract to instantPoolOwner
	/// @param _amount - Amount of MATICX to be withdrawn
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

	/// @dev withdraw MATIC from this contract to instantPoolOwner
	/// @param _amount - Amount of MATIC to be withdrawn
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
		IERC20Upgradeable(maticToken).safeTransfer(instantPoolOwner, _amount);
	}

	/// @dev mints MaticX to instantPoolMatic. It uses instantPoolMatic funds
	function mintMaticXToInstantPool()
		external
		override
		whenNotPaused
		onlyRole(INSTANT_POOL_OWNER)
	{
		require(instantPoolMatic > 0, "Matic amount cannot be 0");

		uint256 maticxMinted = delegateToMint(
			address(this),
			instantPoolMatic,
			false
		);
		instantPoolMaticX += maticxMinted;
		instantPoolMatic = 0;
	}

	/// @dev swap MATIC for MATICX via instant pool
	/// @param _amount - Amount of MATIC to be swapped
	function swapMaticForMaticXViaInstantPool(uint256 _amount)
		external
		override
		whenNotPaused
	{
		require(_amount > 0, "Invalid amount");
		IERC20Upgradeable(maticToken).safeTransferFrom(
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
	 * @dev Send MATIC token to MaticX contract and mints MaticX to msg.sender
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

		IERC20Upgradeable(maticToken).safeTransferFrom(
			msg.sender,
			address(this),
			_amount
		);

		return delegateToMint(msg.sender, _amount, false);
	}

	/**
	 * @dev Send POL token to MaticX contract and mints MaticX to msg.sender
	 * @notice Requires that msg.sender has approved _amount of POL to this contract
	 * @param _amount - Amount of POL sent from msg.sender to this contract
	 * @return Amount of MaticX shares generated
	 */
	function submitPOL(uint256 _amount)
		external
		override
		whenNotPaused
		returns (uint256)
	{
		require(_amount > 0, "Invalid amount");

		IERC20Upgradeable(polToken).safeTransferFrom(
			msg.sender,
			address(this),
			_amount
		);

		return delegateToMint(msg.sender, _amount, true);
	}

	/**
	 * @dev Stores user's request to withdraw into WithdrawalRequest struct
	 * @param _amount - Amount of maticX that is requested to withdraw
	 */
	function requestWithdraw(uint256 _amount) external override whenNotPaused {
		require(_amount > 0, "Invalid amount");

		(
			uint256 totalAmount2WithdrawInMatic,
			uint256 totalShares,
			uint256 totalPooledMatic
		) = convertMaticXToMatic(_amount);

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

			IValidatorShare(validatorShare).sellVoucher_new(
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
				totalPooledMatic - totalAmount2WithdrawInMatic
			)
		);

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

	/**
	 * @dev withdraw rewards from validator
	 * @param _validatorId - Validator id to withdraw rewards for
	 */
	function _withdrawRewards(uint256 _validatorId) internal returns (uint256) {
		address validatorShare = IStakeManager(stakeManager)
			.getValidatorContract(_validatorId);

		uint256 balanceBeforeRewards = IERC20Upgradeable(maticToken)
			.balanceOf(address(this));
		IValidatorShare(validatorShare).withdrawRewards();
		uint256 rewards = IERC20Upgradeable(maticToken).balanceOf(
			address(this)
		) - balanceBeforeRewards;

		emit WithdrawRewards(_validatorId, rewards);
		return rewards;
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
		return _withdrawRewards(_validatorId);
	}

	function withdrawValidatorsReward(uint256[] calldata _validatorIds)
		public
		override
		whenNotPaused
		returns (uint256[] memory)
	{
		uint256[] memory rewards = new uint256[](_validatorIds.length);
		for (uint256 i = 0; i < _validatorIds.length; i++) {
			rewards[i] = _withdrawRewards(_validatorIds[i]);
		}
		return rewards;
	}

	/**
	 * @dev stake rewards and distribute fees to treasury. Only callable by BOT
	 * @param _validatorId - Validator id to stake rewards
	 */
	function stakeRewardsAndDistributeFees(uint256 _validatorId)
		external
		override
		whenNotPaused
		onlyRole(BOT)
	{
		require(
			IValidatorRegistry(validatorRegistry).validatorIdExists(
				_validatorId
			),
			"Doesn't exist in validator registry"
		);

		address validatorShare = IStakeManager(stakeManager)
			.getValidatorContract(_validatorId);

		uint256 rewards = IERC20Upgradeable(maticToken).balanceOf(
			address(this)
		) - instantPoolMatic;

		require(rewards > 0, "Reward is zero");

		uint256 treasuryFees = (rewards * feePercent) / 100;

		if (treasuryFees > 0) {
			IERC20Upgradeable(maticToken).safeTransfer(
				treasury,
				treasuryFees
			);
			emit DistributeFees(treasury, treasuryFees);
		}

		uint256 amountStaked = rewards - treasuryFees;
		IValidatorShare(validatorShare).buyVoucher(amountStaked, 0);

		uint256 totalShares = totalSupply();
		uint256 totalPooledMatic = getTotalPooledMatic();

		IFxStateRootTunnel(fxStateRootTunnel).sendMessageToChild(
			abi.encode(totalShares, totalPooledMatic)
		);

		emit StakeRewards(_validatorId, amountStaked);
	}

	/**
	 * @dev Migrate the staked tokens to another validaor
	 */
	function migrateDelegation(
		uint256 _fromValidatorId,
		uint256 _toValidatorId,
		uint256 _amount
	) external override whenNotPaused onlyRole(INSTANT_POOL_OWNER) {
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
	 * @dev Helper function for submit function
	 * @param depositSender - Address of the user that is depositing
	 * @param _amount - Amount of MATIC sent from msg.sender to this contract
	 * @return Amount of MaticX shares generated
	 */
	function delegateToMint(address depositSender, uint256 _amount, bool pol)
		internal
		returns (uint256)
	{
		(
			uint256 amountToMint,
			uint256 totalShares,
			uint256 totalPooledMatic
		) = convertMaticToMaticX(_amount);

		_mint(depositSender, amountToMint);
		emit Submit(depositSender, _amount);

		uint256 preferredValidatorId = IValidatorRegistry(validatorRegistry)
			.preferredDepositValidatorId();
		address validatorShare = IStakeManager(stakeManager)
			.getValidatorContract(preferredValidatorId);

		pol
			? IValidatorShare(validatorShare).buyVoucherPOL(_amount, 0)
			: IValidatorShare(validatorShare).buyVoucher(_amount, 0);

		IFxStateRootTunnel(fxStateRootTunnel).sendMessageToChild(
			abi.encode(totalShares + amountToMint, totalPooledMatic + _amount)
		);

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
		uint256 balanceBeforeClaim = IERC20Upgradeable(maticToken).balanceOf(
			address(this)
		);
		WithdrawalRequest[] storage userRequests = userWithdrawalRequests[_to];
		WithdrawalRequest memory userRequest = userRequests[_idx];
		require(
			IStakeManager(stakeManager).epoch() >= userRequest.requestEpoch,
			"Not able to claim yet"
		);

		IValidatorShare(userRequest.validatorAddress).unstakeClaimTokens_new(
			userRequest.validatorNonce
		);

		// swap with the last item and pop it.
		userRequests[_idx] = userRequests[userRequests.length - 1];
		userRequests.pop();

		amountToClaim =
			IERC20Upgradeable(maticToken).balanceOf(address(this)) -
			balanceBeforeClaim;

		IERC20Upgradeable(maticToken).safeTransfer(_to, amountToClaim);

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

	/// @notice Allows to set the address of the instant pool owner. Only callable by the admin.
	/// @param _address Address of the instant pool owner.
	function setInstantPoolOwner(address _address)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		require(instantPoolOwner != _address, "Old address == new address");

		_revokeRole(INSTANT_POOL_OWNER, instantPoolOwner);
		instantPoolOwner = _address;
		_setupRole(INSTANT_POOL_OWNER, _address);

		emit SetInstantPoolOwner(_address);
	}

	/// @notice Allows to set the address of the treasury. Only callable by the admin.
	/// @param _address Address of the treasury.
	function setTreasury(address _address)
		external
		override
		onlyRole(INSTANT_POOL_OWNER)
	{
		treasury = _address;

		emit SetTreasury(_address);
	}

	/// @notice Allows to set the address of the stake manager. Only callable by the admin.
	/// @param _address Address of the stake manager.
	function setValidatorRegistry(address _address)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		validatorRegistry = _address;

		emit SetValidatorRegistry(_address);
	}

	/// @notice Allows to set the address of the stake manager. Only callable by the admin.
	/// @param _address Address of the stake manager.
	function setFxStateRootTunnel(address _address)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		fxStateRootTunnel = _address;

		emit SetFxStateRootTunnel(_address);
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

	/// @dev Set the address of the POL token
	/// @param _address - Address of the POL token
	function setPOLToken(address _address)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		polToken = _address;

		emit SetPOLToken(_address);
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

	/// @notice Returns the contracts used by the MaticX contract.
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
