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
	uint32 totalPartnerCount;
	UnstakeRequest[] public unstakeRequests;

	mapping(uint32 => Batch) public batches;
	uint32 currentBatchId;

	address private foundation;
	address private maticX;
	address private polygonERC20;
	address private manager;
	address private trustedForwarder;

	function initialize(
		address _foundation,
		address _polygonERC20,
		address _maticX,
		address _manager
	) external initializer {
		__AccessControl_init();
		__Pausable_init();

		foundation = _foundation;
		maticX = _maticX;
		manager = _manager;
		polygonERC20 = _polygonERC20;

		// create a new batch
		currentBatchId = 1;
		Batch storage _currentBatch = batches[currentBatchId];
		_currentBatch.createdAt = uint64(block.timestamp);
		_currentBatch.status = BatchStatus.CREATED;
	}

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

	modifier onlyFoundation() {
		require(_msgSender() == foundation, "Not Authorized");
		_;
	}

	modifier onlyManager() {
		require(_msgSender() == manager, "Not Authorized");
		_;
	}

	function registerPartner(
		address _partnerAddress,
		string calldata _name,
		string calldata _website,
		bytes calldata _metadata
	) external override onlyFoundation returns (uint32) {
		require(
			partnerAddressToId[_partnerAddress] == 0,
			"This partner is already registered"
		);
		uint32 _partnerId = totalPartnerCount + 1;
		partners[_partnerId] = Partner(
			_name,
			_partnerAddress,
			_website,
			_metadata,
			uint64(block.timestamp),
			0, // totalMaticStaked
			0, // totalMaticX
			PartnerStatus.ACTIVE
		);
		partnerAddressToId[_partnerAddress] = _partnerId;
		totalPartnerCount = _partnerId;
		return _partnerId;
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
		onlyFoundation
	{
		require(
			_partnerId > 0 && _partnerId <= totalPartnerCount,
			"Invalid or Unregistered PartnerId"
		);
		require(_maticAmount > 0, "Invalid amount");
		Partner storage partner = partners[_partnerId];
		require(partner.status == PartnerStatus.ACTIVE, "Inactive Partner");
		IERC20Upgradeable(polygonERC20).safeApprove(maticX, _maticAmount);
		uint256 _maticXAmount = IMaticX(maticX).submit(_maticAmount);
		partner.totalMaticStaked += _maticAmount;
		partner.totalMaticX += _maticXAmount;
	}

	function unStake(uint32 _partnerId, uint256 _maticAmount)
		external
		override
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
		onlyManager
	{
		Batch storage _currentBatch = batches[currentBatchId];
		require(
			_currentBatch.status == BatchStatus.CREATED,
			"Invalid Batch Status"
		);

		(uint256 _maticXRate, , ) = IMaticX(maticX).convertMaticToMaticX(
			10**18
		);

		for (uint32 i = 0; i < _partnerIds.length; i++) {
			uint32 _partnerId = _partnerIds[i];
			Partner storage _currentPartner = partners[_partnerId];
			require(
				_currentPartner.walletAddress != address(0),
				"Invalid PartnerId"
			);

			uint256 _reward = _currentPartner.totalMaticX -
				((_currentPartner.totalMaticStaked * _maticXRate) / 10**18);

			_currentPartner.totalMaticX -= _reward;

			_currentBatch.maticXBurned += _reward;
			_currentBatch.partnersShare[_partnerId] = PartnerUnstakeShare(
				_reward,
				false
			);
		}
	}

	function unDelegateCurrentBatch() external override onlyManager {
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
		// TODO: figure this out
		//(,uint256 _requestEpoch,) = (IMaticX(maticX).getUserWithdrawalRequests(address(this)));
		unstakeRequests.push(
			UnstakeRequest(
				0, // partnerId
				_batchId,
				_currentBatch.maticXBurned //maticXBurned
			)
		);

		_currentBatch.undelegatedAt = uint64(block.timestamp);
		//_currentBatch.withdrawalEpoch = uint64(_requestEpoch);
		_currentBatch.status = BatchStatus.UNDELEGATED;

		// create a new batch
		currentBatchId += 1;
		Batch storage _newBatch = batches[currentBatchId];
		_newBatch.createdAt = uint64(block.timestamp);
		_newBatch.status = BatchStatus.CREATED;
	}

	function claimUnstakeRewards(uint32 _reqIdx) external override onlyManager {
		require(
			_reqIdx >= 0 && _reqIdx < unstakeRequests.length,
			"Invalid Request Index"
		);
		uint32 _batchId = unstakeRequests[_reqIdx].batchId;
		require(_batchId > 0, "Not a partner reward unstake request");
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
	) external override onlyManager {
		Batch storage _currentBatch = batches[_batchId];
		require(
			_currentBatch.status == BatchStatus.CLAIMED,
			"Batch Rewards hasn't been claimed yet"
		);

		for (uint32 i = 0; i < _partnerIds.length; i++) {
			uint32 _partnerId = _partnerIds[i];
			PartnerUnstakeShare memory _partnerShare = _currentBatch
				.partnersShare[_partnerId];
			require(_partnerShare.maticXUnstaked > 0, "Invalid PartnerId");
			require(
				_partnerShare.isDisbursed == true,
				"Partner Reward has already been disbursed"
			);

			uint256 _maticShare = (_partnerShare.maticXUnstaked *
				_currentBatch.maticReceived) / _currentBatch.maticXBurned;

			// save the state
			_currentBatch.partnersShare[_partnerId].isDisbursed == true;

			// transfer rewards
			IERC20Upgradeable(polygonERC20).safeTransfer(
				partners[_partnerId].walletAddress,
				_maticShare
			);
			emit PartnerActivity(
				block.timestamp,
				_maticShare,
				_partnerShare.maticXUnstaked,
				PartnerActivityType.AUTO_DISBURSED
			);
		}
	}
}
