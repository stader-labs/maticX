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

	mapping(uint32 => Partner) private partners;
	mapping(address => uint32) public partnerAddressToId;
	uint32 public override currentPartnerId;
	UnstakeRequest[] public unstakeRequests;

	mapping(uint32 => Batch) public batches;
	uint32 public override currentBatchId;
	uint8 public override feeReimbursalPercent;
	uint256 public override feeReimbursalPool;

	address private foundationAddress;
	mapping(address => uint64) private foundationApprovedAddresses;
	address private maticX;
	address private polygonERC20;
	address private manager;
	address private disbursalBotAddress;
	address private trustedForwarder;

	function initialize(
		address _foundationAddress,
		address _polygonERC20,
		address _maticX,
		address _manager,
		address _disbursalBotAddress
	) external initializer {
		__AccessControl_init();
		__Pausable_init();

		foundationAddress = _foundationAddress;
		foundationApprovedAddresses[foundationAddress] = uint64(
			block.timestamp
		);
		maticX = _maticX;
		manager = _manager;
		disbursalBotAddress = _disbursalBotAddress;
		polygonERC20 = _polygonERC20;
		feeReimbursalPercent = 5;

		// create a new batch
		currentBatchId = 1;
		Batch storage _currentBatch = batches[currentBatchId];
		_currentBatch.createdAt = uint64(block.timestamp);
		_currentBatch.status = BatchStatus.CREATED;
	}

	modifier onlyFoundation() {
		require(_msgSender() == foundationAddress, "Not Authorized");
		_;
	}

	modifier onlyManager() {
		require(_msgSender() == manager, "Not Authorized");
		_;
	}

	modifier onlyDisbursalBot() {
		require(_msgSender() == disbursalBotAddress, "Not Authorized");
		_;
	}

	function addFoundationApprovedAddress(address _address)
		external
		override
		onlyFoundation
	{
		require(_address != address(0), "Invalid Address");
		foundationApprovedAddresses[_address] = uint64(block.timestamp);
		emit AddFoundationApprovedAddress(_address, block.timestamp);
	}

	function removeFoundationApprovedAddress(address _address)
		external
		override
		onlyFoundation
	{
		require(_address != address(0), "Invalid Address");
		foundationApprovedAddresses[_address] = uint64(0);
		emit RemoveFoundationApprovedAddress(_address, block.timestamp);
	}

	function isFoundationApprovedAddress(address _address)
		external
		override
		returns (bool)
	{
		return (foundationApprovedAddresses[_address] > 0);
	}

	function setDisbursalBotAddress(address _address)
		external
		override
		onlyManager
	{
		require(_address != address(0), "Invalid Address");
		disbursalBotAddress = _address;

		emit SetDisbursalBotAddress(_address, block.timestamp);
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

	function setFeeReimbursalPercent(uint8 _feeReimbursalPercent)
		external
		override
		whenNotPaused
		onlyManager
	{
		uint8 maticXFeePercent = IMaticX(maticX).feePercent();
		require(
			_feeReimbursalPercent <= maticXFeePercent,
			"_feePercent must not exceed maticX fee percent"
		);

		feeReimbursalPercent = _feeReimbursalPercent;

		emit SetFeeReimbursalPercent(_feeReimbursalPercent, block.timestamp);
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
		emit ProvideFeeReimbursalMatic(_amount, block.timestamp);
	}

	function validateAndGetPartner(uint32 _partnerId)
		internal
		returns (Partner storage)
	{
		require(
			partners[_partnerId].walletAddress != address(0),
			"Invalid PartnerId"
		);
		return partners[_partnerId];
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
		currentPartnerId += 1;
		uint32 _partnerId = currentPartnerId;
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
		emit RegisterPartner(_partnerId, _walletAddress, block.timestamp);
		return _partnerId;
	}

	function changePartnerWalletAddress(
		uint32 _partnerId,
		address _newWalletAddress
	) external override onlyFoundation returns (Partner memory) {
		validateAndGetPartner(_partnerId);
		require(_newWalletAddress != address(0), "Invalid Addresses");
		require(
			partnerAddressToId[_newWalletAddress] == 0,
			"New Wallet address is already assigned to other partner"
		);
		address _oldWalletAddress = partners[_partnerId].walletAddress;
		partners[_partnerId].walletAddress = _newWalletAddress;
		partnerAddressToId[_newWalletAddress] = _partnerId;
		partnerAddressToId[_oldWalletAddress] = 0;

		emit ChangePartnerWalletAddress(
			_partnerId,
			_oldWalletAddress,
			_newWalletAddress,
			block.timestamp
		);
		return partners[_partnerId];
	}

	function changePartnerDisbursalCount(
		uint32 _partnerId,
		uint32 _newDisbursalCount
	) external override onlyFoundation returns (Partner memory) {
		validateAndGetPartner(_partnerId);
		Partner memory _partner = partners[_partnerId];
		require(
			_newDisbursalCount != _partner.disbursalCount,
			"Nothing to change"
		);
		if (_newDisbursalCount > _partner.disbursalCount) {
			partners[_partnerId].remDisbursals +=
				_newDisbursalCount -
				_partner.disbursalCount;
			partners[_partnerId].disbursalCount = _newDisbursalCount;
		} else {
			require(
				_partner.disbursalCount - _newDisbursalCount <=
					_partner.remDisbursals,
				"Invalid Disbursal count"
			);
			partners[_partnerId].remDisbursals -=
				_partner.disbursalCount -
				_newDisbursalCount;
			partners[_partnerId].disbursalCount = _newDisbursalCount;
		}
		emit ChangePartnerDisbursalCount(
			_partnerId,
			_newDisbursalCount,
			block.timestamp
		);
		return _partner;
	}

	function changePartnerStatus(uint32 _partnerId, bool _isActive)
		external
		override
		whenNotPaused
		onlyFoundation
		returns (Partner memory)
	{
		validateAndGetPartner(_partnerId);
		partners[_partnerId].status = _isActive
			? PartnerStatus.ACTIVE
			: PartnerStatus.INACTIVE;
		emit ChangePartnerStatus(_partnerId, _isActive, block.timestamp);
		return partners[_partnerId];
	}

	function getPartnerId(address _walletAddress)
		external
		view
		override
		returns (uint32 _partnerId)
	{
		return partnerAddressToId[_walletAddress];
	}

	function getPartnerDetails(uint32 _partnerId)
		external
		view
		override
		returns (Partner memory)
	{
		return partners[_partnerId];
	}

	function getPartners(uint32 _count, uint32 _startId)
		external
		view
		override
		returns (Partner[] memory)
	{
		Partner[] memory results;
		uint32 _totalPartnerCount = currentPartnerId;
		uint32 _idx;
		for (
			uint32 _i = _startId;
			_i <= _totalPartnerCount && _i < (_startId + _count);
			_i++
		) {
			results[_idx] = partners[_i];
			_idx++;
		}
		return results;
	}

	function stake(uint32 _partnerId, uint256 _maticAmount)
		external
		override
		whenNotPaused
		onlyFoundation
	{
		require(_maticAmount > 0, "Invalid amount");
		Partner storage partner = validateAndGetPartner(_partnerId);
		require(partner.status == PartnerStatus.ACTIVE, "Inactive Partner");
		IERC20Upgradeable(polygonERC20).safeTransferFrom(
			msg.sender,
			address(this),
			_maticAmount
		);
		IERC20Upgradeable(polygonERC20).safeApprove(maticX, _maticAmount);
		uint256 _maticXAmount = IMaticX(maticX).submit(_maticAmount);
		partner.totalMaticStaked += _maticAmount;
		partner.totalMaticX += _maticXAmount;
		emit FoundationStake(
			_partnerId,
			partner.walletAddress,
			_maticAmount,
			_maticXAmount,
			block.timestamp
		);
	}

	function unStake(uint32 _partnerId, uint256 _maticAmount)
		external
		override
		whenNotPaused
		onlyFoundation
	{
		Partner storage partner = validateAndGetPartner(_partnerId);
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
		emit FoundationStake(
			_partnerId,
			partner.walletAddress,
			_maticAmount,
			_maticXAmount,
			block.timestamp
		);
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
		emit FoundationWithdraw(_reqIdx, amountToClaim, block.timestamp);
	}

	function addDueRewardsToCurrentBatch(uint32[] calldata _partnerIds)
		external
		override
		whenNotPaused
		onlyDisbursalBot
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
			Partner storage _currentPartner = validateAndGetPartner(_partnerId);

			require(
				_currentPartner.status == PartnerStatus.ACTIVE,
				"Inactive Partner"
			);

			require(
				_currentPartner.remDisbursals > 0,
				"No disbursals remaining for this partner"
			);
			partners[_partnerId].remDisbursals--;

			uint256 _reward = _currentPartner.totalMaticX -
				((_currentPartner.totalMaticStaked * _maticToMaticXRate) /
					10**18);

			if (_reward == 0) continue;

			_currentPartner.totalMaticX -= _reward;

			_currentBatch.maticXBurned += _reward;
			// it will be default 0
			uint256 _partnerPrevShare = _currentBatch
				.partnersShare[_partnerId]
				.maticXUnstaked;
			_currentBatch.partnersShare[_partnerId] = PartnerUnstakeShare(
				_reward + _partnerPrevShare,
				0
			);

			emit UnstakePartnerReward(
				_partnerId,
				_currentPartner.walletAddress,
				currentBatchId,
				_reward,
				block.timestamp
			);
		}
	}

	function unDelegateCurrentBatch()
		external
		override
		whenNotPaused
		onlyDisbursalBot
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

		emit UndelegateBatch(
			_batchId,
			block.timestamp,
			_currentBatch.maticXBurned
		);

		emit CreateBatch(currentBatchId, block.timestamp);
	}

	function getPartnerShare(uint32 _batchId, uint32 _partnerId)
		external
		view
		override
		whenNotPaused
		returns (PartnerUnstakeShare memory)
	{
		require(batches[_batchId].createdAt > 0, "Invalid Batch Id");
		return batches[_batchId].partnersShare[_partnerId];
	}

	function claimUnstakeRewards(uint32 _reqIdx)
		external
		override
		whenNotPaused
		onlyDisbursalBot
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
		emit ClaimBatch(_batchId, _maticReceived, block.timestamp);
	}

	function disbursePartnersReward(
		uint32 _batchId,
		uint32[] calldata _partnerIds
	) external override whenNotPaused onlyDisbursalBot {
		Batch storage _currentBatch = batches[_batchId];
		require(
			_currentBatch.status == BatchStatus.CLAIMED,
			"Batch Rewards haven't been claimed yet"
		);

		uint8 _maticXFeePercent = IMaticX(maticX).feePercent();
		uint8 _feeReimbursalPercent = feeReimbursalPercent;

		for (uint32 i = 0; i < _partnerIds.length; i++) {
			uint32 _partnerId = _partnerIds[i];
			PartnerUnstakeShare memory _partnerShare = _currentBatch
				.partnersShare[_partnerId];
			require(
				_partnerShare.maticXUnstaked > 0,
				"No Partner Share for this partnerId"
			);
			require(
				partners[_partnerId].status == PartnerStatus.ACTIVE,
				"Inactive Partner"
			);
			require(
				_partnerShare.disbursedAt == 0,
				"Partner Reward has already been disbursed"
			);
			_currentBatch.partnersShare[_partnerId].disbursedAt = uint64(
				block.timestamp
			);

			uint256 _maticShare = (_currentBatch.maticReceived *
				_partnerShare.maticXUnstaked) / _currentBatch.maticXBurned;

			uint256 _reimbursedFee = (_maticShare *
				(uint256(_feeReimbursalPercent))) /
				uint256(100 - _maticXFeePercent);

			// save the state
			feeReimbursalPool -= _reimbursedFee;

			// transfer rewards
			IERC20Upgradeable(polygonERC20).safeTransfer(
				partners[_partnerId].walletAddress,
				_maticShare + _reimbursedFee
			);
			emit DisbursePartnerReward(
				_partnerId,
				partners[_partnerId].walletAddress,
				_batchId,
				_maticShare + _reimbursedFee,
				_reimbursedFee,
				_partnerShare.maticXUnstaked,
				block.timestamp
			);
		}
	}
}
