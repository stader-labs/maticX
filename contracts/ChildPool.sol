// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import "./interfaces/IChildPool.sol";
import "./interfaces/IFxStateChildTunnel.sol";

contract ChildPool is
	IChildPool,
	AccessControlUpgradeable,
	PausableUpgradeable
{
	using SafeERC20Upgradeable for IERC20Upgradeable;

	bytes32 public constant INSTANT_POOL_OWNER = keccak256("IPO");

	address private fxStateChildTunnel;
	address private polygonERC20;
	address private maticX;
	address private trustedForwarder;

	address public override instantPoolOwner;
	uint256 public override instantPoolMatic;
	uint256 public override instantPoolMaticX;

	string public override version;
	uint256 public override instantWithdrawalFeeBps;
	uint256 public override instantWithdrawalFees;

	/**
	 * @param _fxStateChildTunnel - Address of the fxStateChildTunnel contract
	 * @param _maticX - Address of maticX token on Polygon
	 * @param _polygonERC20 - Address of matic token on Polygon
	 * @param _manager - Address of the manager
	 * @param _instantPoolOwner - Address of the instant pool owner
	 * @param _instantWithdrawalFeeBps - Fee basis points for using instant withdrawal feature
	 */
	function initialize(
		address _fxStateChildTunnel,
		address _maticX,
		address _polygonERC20,
		address _manager,
		address _instantPoolOwner,
		uint256 _instantWithdrawalFeeBps
	) external initializer {
		__AccessControl_init();
		__Pausable_init();

		_setupRole(DEFAULT_ADMIN_ROLE, _manager);
		_setupRole(INSTANT_POOL_OWNER, _instantPoolOwner);
		instantPoolOwner = _instantPoolOwner;

		fxStateChildTunnel = _fxStateChildTunnel;
		polygonERC20 = _polygonERC20;
		maticX = _maticX;
		instantWithdrawalFeeBps = _instantWithdrawalFeeBps;
	}

	////////////////////////////////////////////////////////////
	/////                                                    ///
	/////             ***Instant Pool Interactions***        ///
	/////                                                    ///
	////////////////////////////////////////////////////////////

	function provideInstantPoolMatic(uint256 _amount)
		external
		override
		whenNotPaused
		onlyRole(INSTANT_POOL_OWNER)
	{
		require(_amount > 0, "Invalid amount");
		IERC20Upgradeable(polygonERC20).safeTransferFrom(
			_msgSender(),
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
		IERC20Upgradeable(maticX).safeTransferFrom(
			_msgSender(),
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
		IERC20Upgradeable(polygonERC20).safeTransfer(instantPoolOwner, _amount);
	}

	function withdrawInstantWithdrawalFees(uint256 _amount)
		external
		override
		whenNotPaused
		onlyRole(INSTANT_POOL_OWNER)
	{
		require(
			instantWithdrawalFees >= _amount,
			"Withdraw amount cannot exceed collected matic in instantWithdrawalFees"
		);

		IERC20Upgradeable(polygonERC20).safeTransfer(instantPoolOwner, _amount);

		instantWithdrawalFees -= _amount;
	}

	function swapMaticForMaticXViaInstantPool(uint256 _amount)
		external
		override
		whenNotPaused
	{
		require(_amount > 0, "Invalid amount");
		IERC20Upgradeable(polygonERC20).safeTransferFrom(
			_msgSender(),
			address(this),
			_amount
		);

		(uint256 amountInMaticX, , ) = IFxStateChildTunnel(fxStateChildTunnel)
			.convertMaticToMaticX(_amount);
		require(
			instantPoolMaticX >= amountInMaticX,
			"Not enough maticX to instant swap"
		);

		IERC20Upgradeable(maticX).safeTransfer(_msgSender(), amountInMaticX);
		instantPoolMatic += _amount;
		instantPoolMaticX -= amountInMaticX;
	}

	function swapMaticXForMaticViaInstantPool(uint256 _amount)
		external
		override
		whenNotPaused
	{
		require(_amount > 0, "Invalid amount");
		IERC20Upgradeable(maticX).safeTransferFrom(
			_msgSender(),
			address(this),
			_amount
		);

		(uint256 amountInMatic, , ) = IFxStateChildTunnel(fxStateChildTunnel)
			.convertMaticXToMatic(_amount);
		(
			uint256 amountInMaticAfterFees,
			uint256 fees
		) = getAmountAfterInstantWithdrawalFees(amountInMatic);
		require(
			instantPoolMatic >= amountInMaticAfterFees,
			"Not enough matic to instant swap"
		);

		IERC20Upgradeable(polygonERC20).safeTransfer(
			_msgSender(),
			amountInMaticAfterFees
		);
		instantPoolMatic -= amountInMaticAfterFees;
		instantPoolMaticX += _amount;

		instantWithdrawalFees += fees;
		emit CollectedInstantWithdrawalFees(fees);
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
	 * @notice Callable only by manager
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
			address _polygonERC20,
			address _maticX,
			address _trustedForwarder
		)
	{
		_fxStateChildTunnel = fxStateChildTunnel;
		_polygonERC20 = polygonERC20;
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
