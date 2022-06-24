// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../contracts/interfaces/IPartnerStaking.sol";
import "../contracts/interfaces/IMaticX.sol";

contract PartnerStaking is
	IPartnerStaking,
	Initializable,
	AccessControlUpgradeable,
	PausableUpgradeable
{
	using SafeERC20Upgradeable for IERC20Upgradeable;

	mapping(uint32 => Partner) partners;
	mapping(address => uint32) partnerAddressToId;
	uint32 public override totalPartnerCount;
	UnstakeRequest[] public unstakeRequests;

	mapping(uint32 => Batch) public batches;
	uint32 public override currentBatchId;
	uint8 public override feePercent;
	uint256 public override feeReimbursalPool;

	address private foundation;
	address private maticX;
	address private polygonERC20;
	address private manager;
	address private disbursalBot;
	address private trustedForwarder;

	function initialize(
		address _foundation,
		address _polygonERC20,
		address _maticX,
		address _manager,
		address _disbursalBot,
		uint8 _feePercent
	) external initializer {
		__AccessControl_init();
		__Pausable_init();

		foundation = _foundation;
		maticX = _maticX;
		manager = _manager;
		disbursalBot = _disbursalBot;
		polygonERC20 = _polygonERC20;
		feePercent = 5;

		// create a new batch
		currentBatchId = 1;
		Batch storage _currentBatch = batches[currentBatchId];
		_currentBatch.createdAt = uint64(block.timestamp);
		_currentBatch.status = BatchStatus.CREATED;
	}

	modifier onlyFoundation() {
		require(_msgSender() == foundation, "Not Authorized");
		_;
	}

	modifier onlyManager() {
		require(_msgSender() == manager, "Not Authorized");
		_;
	}

	function setDisbursalBot(address _address) external override onlyManager {
		require(_address != address(0), "Invalid Address");
		disbursalBot = _address;

		emit SetDisbursalBot(_address);
	}

	function setTrustedForwarder(address _address)
		external
		override
		onlyManager
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

	function setFeePercent(uint8 _feePercent)
		external
		override
		whenNotPaused
		onlyManager
	{
		uint8 maticXFeePercent = IMaticX(maticX).feePercent();
		require(
			_feePercent <= maticXFeePercent,
			"_feePercent must not exceed maticX fee percent"
		);

		feePercent = _feePercent;

		emit SetFeePercent(_feePercent);
	}

	function provideFeeReimbursalMatic(uint256 _amount)
		external
		override
		whenNotPaused
	{
		require(_amount > 0, "Invalid amount");
		IERC20Upgradeable(polygonERC20).safeTransferFrom(
			msg.sender,
			address(this),
			_amount
		);

		feeReimbursalPool += _amount;
	}

	function validatePartnerId(uint32 _partnerId) internal {
		require(
			partners[_partnerId].walletAddress != address(0),
			"Invalid PartnerId"
		);
	}

	function registerPartner(
		address _walletAddress,
		string calldata _name,
		string calldata _website,
		bytes calldata _metadata,
		DisbursalCycleType _disbursalCycle,
		uint32 _disbursalCount,
		uint256 _pastManualRewards
	) external override whenNotPaused onlyFoundation returns (uint32) {
		require(
			partnerAddressToId[_walletAddress] == 0,
			"This partner is already registered"
		);
		require(
			_disbursalCount > 0,
			"Disbursal Count for partner delegation cannot be 0"
		);
		totalPartnerCount += 1;
		uint32 _partnerId = totalPartnerCount;
		partners[_partnerId] = Partner(
			_disbursalCount, //remDisbursals
			_disbursalCount, //disbursalCount
			uint64(block.timestamp), //registeredAt
			0, //totalMaticStaked;
			0, //totalMaticX
			_pastManualRewards, //pastManualRewards
			_walletAddress, //walletAddress;
			_name, //name
			_website, //website
			_metadata, //metadata;
			PartnerStatus.ACTIVE, //status;
			_disbursalCycle //disbursalCycle
		);
		partnerAddressToId[_walletAddress] = _partnerId;
		return _partnerId;
	}

	function changePartnerWalletAddress(
		uint32 _partnerId,
		address _newWalletAddress
	) external override onlyFoundation returns (Partner memory) {
		validatePartnerId(_partnerId);
		require(_newWalletAddress != address(0), "Invalid Addresses");
		require(
			partnerAddressToId[_newWalletAddress] == 0,
			"New Wallet address is already assigned to other partner"
		);
		address _oldWalletAddress = partners[_partnerId].walletAddress;
		partners[_partnerId].walletAddress = _newWalletAddress;
		partnerAddressToId[_newWalletAddress] = _partnerId;
		partnerAddressToId[_oldWalletAddress] = 0;
		return partners[_partnerId];
	}

	function changePartnerDisbursalCount(
		uint32 _partnerId,
		uint32 _newDisbursalCount
	) external override onlyFoundation returns (Partner memory) {
		validatePartnerId(_partnerId);
		Partner memory _partner = partners[_partnerId];
		if (_newDisbursalCount > _partner.disbursalCount) {
			partners[_partnerId].remDisbursals +=
				_newDisbursalCount -
				_partner.disbursalCount;
			partners[_partnerId].disbursalCount = _newDisbursalCount;
		}
		if (_newDisbursalCount < _partner.disbursalCount) {
			require(
				_partner.disbursalCount - _newDisbursalCount <
					_partner.remDisbursals,
				"Invalid Disbursal count"
			);
			partners[_partnerId].remDisbursals -=
				_partner.disbursalCount -
				_newDisbursalCount;
			partners[_partnerId].disbursalCount = _newDisbursalCount;
		}
		return _partner;
	}

	function changePartnerStatus(uint32 _partnerId, bool _isActive)
		external
		override
		whenNotPaused
		onlyFoundation
		returns (Partner memory)
	{
		validatePartnerId(_partnerId);
		partners[_partnerId].status = _isActive == true
			? PartnerStatus.ACTIVE
			: PartnerStatus.INACTIVE;
		return partners[_partnerId];
	}

	function getPartnerDetails(uint32 _partnerId)
		external
		view
		override
		returns (Partner memory)
	{
		return partners[_partnerId];
	}

	function getPartners(uint32 _count, uint32 _offset)
		external
		view
		override
		returns (Partner[] memory)
	{
		Partner[] memory result;
		uint32 _i = totalPartnerCount - _offset;
		uint32 _idx = 0;
		while (_i > 0 && _count > 0) {
			result[_idx] = partners[_i];
			_i--;
			_count--;
			_idx++;
		}
		return result;
	}

	function stake(uint32 _partnerId, uint256 _maticAmount)
		external
		override
		whenNotPaused
		onlyFoundation
	{
		require(
			_partnerId > 0 && _partnerId <= totalPartnerCount,
			"Invalid or Unregistered PartnerId"
		);
		require(_maticAmount > 0, "Invalid amount");
		Partner storage partner = partners[_partnerId];
		require(partner.status == PartnerStatus.ACTIVE, "Inactive Partner");
		// do i really need this?
		IERC20Upgradeable(polygonERC20).safeTransferFrom(
			msg.sender,
			address(this),
			_maticAmount
		);
		IERC20Upgradeable(polygonERC20).safeApprove(maticX, _maticAmount);
		uint256 _maticXAmount = IMaticX(maticX).submit(_maticAmount);
		partner.totalMaticStaked += _maticAmount;
		partner.totalMaticX += _maticXAmount;
	}

	function unStake(uint32 _partnerId, uint256 _maticAmount)
		external
		override
		whenNotPaused
		onlyFoundation
	{
		require(
			_partnerId > 0 && _partnerId <= totalPartnerCount,
			"Invalid or Unregistered PartnerId"
		);
		Partner storage partner = partners[_partnerId];
		require(
			_maticAmount > 0 && _maticAmount <= partner.totalMaticStaked,
			"Invalid amount"
		);

		(uint256 _maticXAmount, , ) = IMaticX(maticX).convertMaticToMaticX(
			_maticAmount
		);

		IERC20Upgradeable(maticX).safeApprove(maticX, _maticXAmount);
		IMaticX(maticX).requestWithdraw(_maticXAmount);

		unstakeRequests.push(
			UnstakeRequest(
				_partnerId, // partnerId
				0, // batchId
				_maticXAmount //maticXBurned
			)
		);

		partner.totalMaticStaked -= _maticAmount;
		partner.totalMaticX -= _maticXAmount;
	}

	function withdrawUnstakedAmount(uint256 _reqIdx)
		external
		override
		whenNotPaused
		onlyFoundation
	{
		require(
			_reqIdx >= 0 && _reqIdx < unstakeRequests.length,
			"Invalid Request Index"
		);
		UnstakeRequest memory currentRequest = unstakeRequests[_reqIdx];
		require(
			currentRequest.partnerId > 0,
			"Not a foundation unstake request"
		);

		uint256 balanceBeforeClaim = IERC20Upgradeable(polygonERC20).balanceOf(
			address(this)
		);
		IMaticX(maticX).claimWithdrawal(_reqIdx);
		uint256 amountToClaim = IERC20Upgradeable(polygonERC20).balanceOf(
			address(this)
		) - balanceBeforeClaim;

		unstakeRequests[_reqIdx] = unstakeRequests[unstakeRequests.length - 1];
		unstakeRequests.pop();

		IERC20Upgradeable(polygonERC20).safeTransfer(
			_msgSender(),
			amountToClaim
		);
	}

	function addDueRewardsToCurrentBatch(uint32[] calldata _partnerIds)
		external
		override
		whenNotPaused
		onlyManager
	{
		Batch storage _currentBatch = batches[currentBatchId];
		require(
			_currentBatch.status == BatchStatus.CREATED,
			"Invalid Batch Status"
		);

		(uint256 _maticToMaticXRate, , ) = IMaticX(maticX).convertMaticToMaticX(
			10**18
		);

		for (uint32 i = 0; i < _partnerIds.length; i++) {
			uint32 _partnerId = _partnerIds[i];
			Partner storage _currentPartner = partners[_partnerId];
			require(
				_currentPartner.walletAddress != address(0),
				"Invalid PartnerId"
			);

			require(
				_currentPartner.status == PartnerStatus.ACTIVE,
				"Inactive Partner"
			);

			require(
				_currentPartner.remDisbursals > 0,
				"No disbursals remaining for this partner"
			);

			uint256 _reward = _currentPartner.totalMaticX -
				((_currentPartner.totalMaticStaked * _maticToMaticXRate) /
					10**18);

			_currentPartner.totalMaticX -= _reward;

			_currentBatch.maticXBurned += _reward;
			// it will be default 0
			uint256 _partnerPrevShare = _currentBatch
				.partnersShare[_partnerId]
				.maticXUnstaked;
			_currentBatch.partnersShare[_partnerId] = PartnerUnstakeShare(
				_reward + _partnerPrevShare,
				false
			);
		}
	}

	function unDelegateCurrentBatch()
		external
		override
		whenNotPaused
		onlyManager
	{
		uint32 _batchId = currentBatchId;
		Batch storage _currentBatch = batches[_batchId];
		require(
			_currentBatch.maticXBurned > 0,
			"Cannot undelegate empty batch"
		);
		require(
			_currentBatch.status == BatchStatus.CREATED,
			"Invalid Batch Status"
		);

		IERC20Upgradeable(maticX).safeApprove(
			maticX,
			_currentBatch.maticXBurned
		);
		IMaticX(maticX).requestWithdraw(_currentBatch.maticXBurned);
		uint32 _idx = uint32(unstakeRequests.length);
		IMaticX.WithdrawalRequest[] memory withdrawalRequests = IMaticX(maticX)
			.getUserWithdrawalRequests(address(this));
		uint256 _requestEpoch = withdrawalRequests[_idx].requestEpoch;
		unstakeRequests.push(
			UnstakeRequest(
				0, // partnerId
				_batchId,
				_currentBatch.maticXBurned //maticXBurned
			)
		);

		_currentBatch.undelegatedAt = uint64(block.timestamp);
		_currentBatch.withdrawalEpoch = uint64(_requestEpoch);
		_currentBatch.status = BatchStatus.UNDELEGATED;

		// create a new batch
		currentBatchId += 1;
		Batch storage _newBatch = batches[currentBatchId];
		_newBatch.createdAt = uint64(block.timestamp);
		_newBatch.status = BatchStatus.CREATED;
	}

	function claimUnstakeRewards(uint32 _reqIdx)
		external
		override
		whenNotPaused
		onlyManager
	{
		require(
			_reqIdx >= 0 && _reqIdx < unstakeRequests.length,
			"Invalid Request Index"
		);
		uint32 _batchId = unstakeRequests[_reqIdx].batchId;
		require(_batchId > 0, "Not a disbursal reward unstake request");
		Batch storage _currentBatch = batches[_batchId];
		require(
			_currentBatch.status == BatchStatus.UNDELEGATED,
			"Invalid Batch Status"
		);

		uint256 balanceBeforeClaim = IERC20Upgradeable(polygonERC20).balanceOf(
			address(this)
		);
		IMaticX(maticX).claimWithdrawal(_reqIdx);
		uint256 _maticReceived = IERC20Upgradeable(polygonERC20).balanceOf(
			address(this)
		) - balanceBeforeClaim;

		unstakeRequests[_reqIdx] = unstakeRequests[unstakeRequests.length - 1];
		unstakeRequests.pop();

		_currentBatch.maticReceived = _maticReceived;
		_currentBatch.claimedAt = uint64(block.timestamp);
		_currentBatch.status = BatchStatus.CLAIMED;
	}

	function disbursePartnersReward(
		uint32 _batchId,
		uint32[] calldata _partnerIds
	) external override whenNotPaused onlyManager {
		Batch storage _currentBatch = batches[_batchId];
		require(
			_currentBatch.status == BatchStatus.CLAIMED,
			"Batch Rewards haven't been claimed yet"
		);

		uint8 _maticXFeePercent = IMaticX(maticX).feePercent();
		uint8 _reimbursalFeePercent = _maticXFeePercent - feePercent;

		for (uint32 i = 0; i < _partnerIds.length; i++) {
			uint32 _partnerId = _partnerIds[i];
			PartnerUnstakeShare memory _partnerShare = _currentBatch
				.partnersShare[_partnerId];
			require(_partnerShare.maticXUnstaked > 0, "Invalid PartnerId");
			require(
				partners[_partnerId].status == PartnerStatus.ACTIVE,
				"Inactive Partner"
			);
			require(
				_partnerShare.isDisbursed == true,
				"Partner Reward has already been disbursed"
			);

			uint256 _maticShare = (_partnerShare.maticXUnstaked *
				_currentBatch.maticReceived) / _currentBatch.maticXBurned;

			uint256 _reimbursedFee = (uint256(_reimbursalFeePercent) *
				_maticShare *
				100) / uint256(100 - _maticXFeePercent);

			// save the state
			_currentBatch.partnersShare[_partnerId].isDisbursed == true;
			feeReimbursalPool -= _reimbursedFee;
			partners[_partnerId].remDisbursals--;

			// transfer rewards
			IERC20Upgradeable(polygonERC20).safeTransfer(
				partners[_partnerId].walletAddress,
				_maticShare + _reimbursedFee
			);
			emit PartnerActivity(
				block.timestamp,
				_maticShare + _reimbursedFee,
				_reimbursedFee,
				_partnerShare.maticXUnstaked,
				PartnerActivityType.AUTO_DISBURSED
			);
		}
	}
}
