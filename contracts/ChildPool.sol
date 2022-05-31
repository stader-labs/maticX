// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "./interfaces/IChildPool.sol";
import "./interfaces/IFxStateChildTunnel.sol";

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

	struct MaticXSwapRequest {
		uint amount;
		uint requestTime;
		uint withdrawalTime;
	}
	mapping(address => MaticXSwapRequest[]) private userMaticXSwapRequests;
	uint256 public override claimedMatic;
	uint256 public override maticXSwapLockPeriod = 5 hours;
	event RequestMaticXSwap(
		address indexed _from,
		uint256 _amountMaticX,
		uint256 _amountMatic
	);
	event ClaimMaticXSwap(
		address indexed _from,
		uint256 indexed _idx,
		uint256 _amountClaimed
	);

	/**
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
		instantPoolOwner.transfer(_amount);
	}

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
		treasury.transfer(_amount);
	}

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

	///@dev request maticX->matic swap from instant pool
	function requestMaticXSwap (uint _amount)
	external
	override
	whenNotPaused {
		require(_amount > 0, "Invalid amount");
		// transfer maticX from user to contract
	    instantPoolMaticX += _amount;
		IERC20Upgradeable(maticX).safeTransferFrom(_msgSender(), address(this), _amount);

		(uint amountInMatic, , ) = IFxStateChildTunnel(fxStateChildTunnel).convertMaticXToMatic(_amount);
		(uint amountInMaticAfterFees, uint fees) = getAmountAfterInstantWithdrawalFees(amountInMatic);

		require(instantPoolMatic >= amountInMaticAfterFees, "Not enough matic to instant swap");

		instantPoolMatic -= amountInMaticAfterFees;
		claimedMatic += amountInMaticAfterFees;
		instantWithdrawalFees += fees;
		uint idx = userMaticXSwapRequests.push(MaticXSwapRequest(amountInMaticAfterFees, now, now + maticXSwapLockPeriod));
		emit RequestMaticXSwap(msg.sender, _amount, amountInMaticAfterFees);
		emit CollectedInstantWithdrawalFees(fees);
	}

	///@dev claim earlier requested maticX->matic swap from instant pool
	function claimMaticXSwap (uint256 _idx)
	external
	override
	whenNotPaused {
		_claimWithdrawal(msg.sender, _idx);
	}

	function _claimMaticXSwap (address _to, uint256 _idx) internal {
		// what happens to it after the function execution
		MaticXSwapRequest[] storage userRequests = userMaticXSwapRequests[_to];
		MaticXSwapRequest memory userRequest = userRequests[_idx];
		require(now >= withdrawalTime, "Not able to claim yet");

	    claimedMatic -= userRequest.amount;
	    IERC20Upgradeable(polygonERC20).safeTransfer(_to, userRequest.amount);
	    userRequests[_idx] = userRequests[userRequests.length - 1];
		userRequests.pop();

		emit ClaimWithdrawal(_to, _idx, userRequest.amount);
	}

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

	function setTreasury(address payable _address)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		treasury = _address;

		emit SetTreasury(_address);
	}

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

	function getAmountAfterInstantWithdrawalFees(uint256 _amount)
		public
		view
		override
		returns (uint256, uint256)
	{
		uint256 fees = (_amount * instantWithdrawalFeeBps) / 10000;

		return (_amount - fees, fees);
	}

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

	function setTrustedForwarder(address _address)
		external
		override
		onlyRole(DEFAULT_ADMIN_ROLE)
	{
		trustedForwarder = _address;

		emit SetTrustedForwarder(_address);
	}

	function isTrustedForwarder(address _address)
		public
		view
		virtual
		returns (bool)
	{
		return _address == trustedForwarder;
	}

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
