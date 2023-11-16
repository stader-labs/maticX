// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

import "./interfaces/IChildPool.sol";
import "./interfaces/IFxStateChildTunnel.sol";

/// @title ChildPool contract
/// @notice Polygon chain pool of funds. Used to facilitate instant swaps.
contract ChildPool is
	IChildPool,
	Initializable,
	AccessControlUpgradeable,
	PausableUpgradeable
{
	using SafeERC20Upgradeable for IERC20Upgradeable;

	bytes32 public constant INSTANT_POOL_OWNER = keccak256("IPO");

	address private fxStateChildTunnel;
	address private maticX;
	address private trustedForwarder;

	address payable public override treasury;
	address payable public override instantPoolOwner;
	uint256 public override instantPoolMatic;
	uint256 public override instantPoolMaticX;

	string public override version;
	uint256 public override instantWithdrawalFeeBps;
	uint256 public override instantWithdrawalFees;

	mapping(address => MaticXSwapRequest[]) private userMaticXSwapRequests;
	uint256 public override claimedMatic;
	uint256 public override maticXSwapLockPeriod;

	/**
	 * @dev initializes the contract
	 * @param _fxStateChildTunnel - Address of the fxStateChildTunnel contract
	 * @param _maticX - Address of maticX token on Polygon
	 * @param _manager - Address of the manager
	 * @param _instantPoolOwner - Address of the instant pool owner
	 * @param _treasury - Address of the treasury
	 * @param _instantWithdrawalFeeBps - Fee basis points for using instant withdrawal feature
	 */
	function initialize(
		address _fxStateChildTunnel,
		address _maticX,
		address _manager,
		address payable _instantPoolOwner,
		address payable _treasury,
		uint256 _instantWithdrawalFeeBps
	) external initializer {
		__AccessControl_init();
		__Pausable_init();

		_setupRole(DEFAULT_ADMIN_ROLE, _manager);
		_setupRole(INSTANT_POOL_OWNER, _instantPoolOwner);
		instantPoolOwner = _instantPoolOwner;
		treasury = _treasury;

		fxStateChildTunnel = _fxStateChildTunnel;
		maticX = _maticX;
		instantWithdrawalFeeBps = _instantWithdrawalFeeBps;
	}

	////////////////////////////////////////////////////////////
	/////                                                    ///
	/////             ***Instant Pool Interactions***        ///
	/////                                                    ///
	////////////////////////////////////////////////////////////

	/**
	 * @dev Function that allows instant pool owner to provide matic to the instant pool
	 */
	function provideInstantPoolMatic()
		external
		payable
		override
		whenNotPaused
		onlyRole(INSTANT_POOL_OWNER)
	{
		require(msg.value > 0, "Invalid amount");

		instantPoolMatic += msg.value;
	}

	/**
	 * @dev Function that allows instant pool owner to provide maticX to the instant pool
	 */
	function provideInstantPoolMaticX(uint256 _amount)
		external
		override
		whenNotPaused
		onlyRole(INSTANT_POOL_OWNER)
	{
		require(_amount > 0, "Invalid amount");

		instantPoolMaticX += _amount;
		IERC20Upgradeable(maticX).safeTransferFrom(
			_msgSender(),
			address(this),
			_amount
		);
	}

	/**
	 * @dev Function that allows instant pool owner to withdraw matic from the instant pool
	 * @param _amount - Amount of matic to withdraw
	 */
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
		AddressUpgradeable.sendValue(instantPoolOwner, _amount);
	}

	/**
	 * @dev Function that allows instant pool owner to withdraw maticX from the instant pool
	 * @param _amount - Amount of maticX to withdraw
	 */
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
		IERC20Upgradeable(maticX).safeTransfer(instantPoolOwner, _amount);
	}

	/**
	 * @dev Function to withdraw instant withdrawal fees to treasury
	 * @param _amount - Amount of matic to withdraw
	 */
	function withdrawInstantWithdrawalFees(uint256 _amount)
		external
		override
		whenNotPaused
	{
		require(
			instantWithdrawalFees >= _amount,
			"Withdraw amount cannot exceed collected matic in instantWithdrawalFees"
		);

		instantWithdrawalFees -= _amount;
		AddressUpgradeable.sendValue(treasury, _amount);
	}

	/**
	 * @dev Function to swap matic for maticX via instant pool
	 */
	function swapMaticForMaticXViaInstantPool()
		external
		payable
		override
		whenNotPaused
	{
		require(msg.value > 0, "Invalid amount");
		instantPoolMatic += msg.value;

		(uint256 amountInMaticX, , ) = convertMaticToMaticX(msg.value);
		require(
			instantPoolMaticX >= amountInMaticX,
			"Not enough maticX to instant swap"
		);

		instantPoolMaticX -= amountInMaticX;
		IERC20Upgradeable(maticX).safeTransfer(_msgSender(), amountInMaticX);
	}

	/**
	 * @dev set maticX swap locking period
	 * @param _hours - locking period in hours
	 */
	function setMaticXSwapLockPeriod(uint256 _hours)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		require(_hours <= 720, "_hours must not exceed 720 (1 month)");

		maticXSwapLockPeriod = _hours * 1 hours;

		emit SetMaticXSwapLockPeriodEvent(_hours);
	}

	/**
	 * @dev returns maticXSwapLockPeriod or 24 hours (default value) in seconds
	 * @return maticXSwapLockPeriod or 24 hours (default value) in seconds
	 */
	function getMaticXSwapLockPeriod() public view override returns (uint256) {
		return (maticXSwapLockPeriod > 0) ? maticXSwapLockPeriod : 24 hours;
	}

	/**
	 * @dev request maticX->matic swap from instant pool
	 * @param _amount - amount of maticX to swap
	 * @return index of the swap request
	 */
	function requestMaticXSwap(uint256 _amount)
		external
		override
		whenNotPaused
		returns (uint256)
	{
		require(_amount > 0, "Invalid amount");

		IERC20Upgradeable(maticX).safeTransferFrom(
			_msgSender(),
			address(this),
			_amount
		);
		instantPoolMaticX += _amount;

		(uint256 amountInMatic, , ) = convertMaticXToMatic(_amount);

		require(
			instantPoolMatic >= amountInMatic,
			"Sorry we don't have enough matic in the instant pool to facilitate this swap"
		);

		instantPoolMatic -= amountInMatic;
		claimedMatic += amountInMatic;
		userMaticXSwapRequests[_msgSender()].push(
			MaticXSwapRequest(
				amountInMatic,
				block.timestamp,
				block.timestamp + getMaticXSwapLockPeriod()
			)
		);
		uint256 idx = userMaticXSwapRequests[_msgSender()].length - 1;
		emit RequestMaticXSwap(_msgSender(), _amount, amountInMatic, idx);
		return idx;
	}

	/**
	 * @dev returns user's maticX swap requests
	 * @param _address - user's address
	 * @return user's maticX swap requests
	 */
	function getUserMaticXSwapRequests(address _address)
		external
		view
		override
		returns (MaticXSwapRequest[] memory)
	{
		return userMaticXSwapRequests[_address];
	}

	/**
	 * @dev claim earlier requested maticX->matic swap from instant pool
	 * @param _idx - index of the swap request
	 */
	function claimMaticXSwap(uint256 _idx) external override whenNotPaused {
		_claimMaticXSwap(_msgSender(), _idx);
	}

	/**
	 * @dev  internal function to claim earlier requested maticX->matic swap from instant pool on behalf of the user
	 * @param _to - user's address
	 * @param _idx - index of the swap request
	 */
	function _claimMaticXSwap(address _to, uint256 _idx) internal {
		MaticXSwapRequest[] storage userRequests = userMaticXSwapRequests[_to];
		require(_idx < userRequests.length, "Invalid Index");
		MaticXSwapRequest memory userRequest = userRequests[_idx];

		require(
			block.timestamp >= userRequest.withdrawalTime,
			"Please wait for the bonding period to get over"
		);

		claimedMatic -= userRequest.amount;
		userRequests[_idx] = userRequests[userRequests.length - 1];
		userRequests.pop();
		AddressUpgradeable.sendValue(payable(_to), userRequest.amount);

		emit ClaimMaticXSwap(_to, _idx, userRequest.amount);
	}

	/**
	 * @dev swapMaticXForMaticViaInstantPool disabled for now!
	 */
	function swapMaticXForMaticViaInstantPool(uint256 _amount)
		external
		override
		whenNotPaused
	{
		// TODO: it is disabled for now!
		revert("Disabled");

		// require(_amount > 0, "Invalid amount");
		// instantPoolMaticX += _amount;
		// IERC20Upgradeable(maticX).safeTransferFrom(
		// 	_msgSender(),
		// 	address(this),
		// 	_amount
		// );

		// (uint256 amountInMatic, , ) = IFxStateChildTunnel(fxStateChildTunnel)
		// 	.convertMaticXToMatic(_amount);
		// (
		// 	uint256 amountInMaticAfterFees,
		// 	uint256 fees
		// ) = getAmountAfterInstantWithdrawalFees(amountInMatic);
		// require(
		// 	instantPoolMatic >= amountInMaticAfterFees,
		// 	"Not enough matic to instant swap"
		// );

		// instantPoolMatic -= amountInMaticAfterFees;
		// instantWithdrawalFees += fees;
		// IERC20Upgradeable(polygonERC20).safeTransfer(
		// 	_msgSender(),
		// 	amountInMaticAfterFees
		// );
		// emit CollectedInstantWithdrawalFees(fees);
	}

	/**
	 * @dev Flips the pause state
	 */
	function togglePause() external override onlyRole(DEFAULT_ADMIN_ROLE) {
		paused() ? _unpause() : _pause();
	}

	////////////////////////////////////////////////////////////
	/////                                                    ///
	/////                 ***Setters***                      ///
	/////                                                    ///
	////////////////////////////////////////////////////////////

	/**
	 * @dev Function that sets the new treasury address
	 * @notice Callable only by admin
	 * @param _address - New treasury address that will be set
	 */
	function setTreasury(address payable _address)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		treasury = _address;

		emit SetTreasury(_address);
	}

	/**
	 * @dev Function that sets the new instant pool owner address
	 * @notice Callable only by admin
	 * @param _address - New instant pool owner address that will be set
	 */
	function setInstantPoolOwner(address payable _address)
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

	/**
	 * @dev Function that sets the new fxStateChildTunnel address
	 * @notice Callable only by admin
	 * @param _address - New fxStateChildTunnel address that will be set
	 */
	function setFxStateChildTunnel(address _address)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		fxStateChildTunnel = _address;

		emit SetFxStateChildTunnel(_address);
	}

	/**
	 * @dev Function that sets instant withdrawal fee basis points
	 * @notice Callable only by admin
	 * @param _feeBps - Fee basis points (100 = 0.1%)
	 */
	function setInstantWithdrawalFeeBps(uint256 _feeBps)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		require(_feeBps <= 10000, "_feeBps must not exceed 10000 (100%)");

		instantWithdrawalFeeBps = _feeBps;

		emit SetInstantWithdrawalFeeBps(_feeBps);
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
	 * @dev values from the conversion of maticX to matic
	 * @param _balance - balance to convert
	 * @return amount in matic, amount in maticX, fees
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
		return
			IFxStateChildTunnel(fxStateChildTunnel).convertMaticXToMatic(
				_balance
			);
	}

	/**
	 * @dev values from the conversion of matic to maticX
	 * @param _balance - balance to convert
	 * @return amount in maticX, amount in matic, fees
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
		return
			IFxStateChildTunnel(fxStateChildTunnel).convertMaticToMaticX(
				_balance
			);
	}

	/**
	 * @dev get amount after instant withdrawal fees
	 * @param _amount - amount to calculate fees for
	 * @return amount after fees and fees
	 */
	function getAmountAfterInstantWithdrawalFees(uint256 _amount)
		public
		view
		override
		returns (uint256, uint256)
	{
		uint256 fees = (_amount * instantWithdrawalFeeBps) / 10000;

		return (_amount - fees, fees);
	}

	/**
	 * @dev returns fxStateChildTunnel, maticX and trustedForwarder addresses
	 * @return fxStateChildTunnel, maticX and trustedForwarder addresses
	 */
	function getContracts()
		external
		view
		override
		returns (
			address _fxStateChildTunnel,
			address _maticX,
			address _trustedForwarder
		)
	{
		_fxStateChildTunnel = fxStateChildTunnel;
		_maticX = maticX;
		_trustedForwarder = trustedForwarder;
	}

	////////////////////////////////////////////////////////////
	/////                                                    ///
	/////                 ***MetaTx***                       ///
	/////                                                    ///
	////////////////////////////////////////////////////////////

	/**
	 * @dev sets trustedForwarder address
	 * @param _address - address to set
	 */
	function setTrustedForwarder(address _address)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		trustedForwarder = _address;

		emit SetTrustedForwarder(_address);
	}

	/**
	 * @dev checks whether an address is a trustedForwarder
	 * @return true if _address is a trustedForwarder
	 */
	function isTrustedForwarder(address _address)
		public
		view
		virtual
		returns (bool)
	{
		return _address == trustedForwarder;
	}

	/**
	 * @dev returns the message sender in the context of a meta transaction
	 */

	function _msgSender()
		internal
		view
		virtual
		override
		returns (address sender)
	{
		if (isTrustedForwarder(msg.sender)) {
			// The assembly code is more direct than the Solidity version using `abi.decode`.
			assembly {
				sender := shr(96, calldataload(sub(calldatasize(), 20)))
			}
		} else {
			return super._msgSender();
		}
	}

	/**
	 * @dev returns the message data in the context of a meta transaction
	 */
	function _msgData()
		internal
		view
		virtual
		override
		returns (bytes calldata)
	{
		if (isTrustedForwarder(msg.sender)) {
			return msg.data[:msg.data.length - 20];
		} else {
			return super._msgData();
		}
	}
}
