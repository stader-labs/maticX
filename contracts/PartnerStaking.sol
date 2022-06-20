// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../contracts/interfaces/IPartnerStaking.sol";

contract PartnerStaking is
	IPartnerStaking,
	Initializable,
	AccessControlUpgradeable,
	PausableUpgradeable
{
	using SafeERC20Upgradeable for IERC20Upgradeable;

	address private foundation;
	address private maticX;
	address private manager;

	function initialize(
		address _foundation,
		address _maticX,
		address _manager
	) external initializer {
		__AccessControl_init();
		__Pausable_init();

		foundation = _foundation;
		maticX = _maticX;
		manager = _manager;

		// create a new batch
		currentBatchId = 1;
		batches[currentBatchId] = Batch(
			uint64(block.timestamp),
			0,
			0,
			0,
			0,
			0,
			BatchStatus.CREATED
		);
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
		string _name,
		string _website,
		bytes _metadata
	) external onlyFoundation returns (uint32) {
		require(
			partnerAddressToId[_partnerAddress] == 0,
			"This partner is already registered"
		);
		uint32 _partnerId = totalPartnerCount + 1;
		partners[_partnerId] = Partner(
			_name,
			_partnerAddress,
			website,
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
		returns (Partner partner)
	{
		return partners[_partnerId];
	}

	// paginated
	function getAllPartnerDetails(uint32 _startId, uint32 _count)
		external
		view
		returns (Partner[])
	{
		Partner[] memory result;
		for (uint32 i = _startId; i <= _startId + _count; i++) {
			result.push(partners[i]);
		}
		return result;
	}

	function stake(uint32 _partnerId, uint256 _maticAmount)
		external
		onlyFoundation
	{
		require(
			_partnerId > 0 && _partnerId <= partnerCount,
			"Invalid or Unregistered PartnerId"
		);
		require(_maticAmount > 0, "Invalid amount");
		Partner storage partner = partners[_partnerId];
		require(partner.status == PartnerStatus.ACTIVE, "Inactive Partner");
		IERC20Upgradeable(polygonERC20).safeApprove(maticX, _maticAmount);
		uint256 _maticXAmount = IMaticX(maticX).submit(_maticAmount);
		partner[totalMaticStaked] += _maticAmount;
		partner[totalMaticX] += _maticXAmount;
	}

	function unStake(uint32 _partnerId, uint256 _maticAmount)
		external
		onlyFoundation
	{
		require(
			_partnerId > 0 && _partnerId <= partnerCount,
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

		uint32 _idx = unstakeRequests.length;
		WithdrawalRequest memory _withdrawalRequest = (
			IMaticX(maticX).getUserWithdrawalRequests(address(this))
		)[_idx];
		unstakeRequests.push(
			UnstakeRequest(
				_partnerId, // partnerId
				0, // batchId
				_withdrawalRequest.validatorNonce,
				_withdrawalRequest.requestEpoch,
				_withdrawalRequest.validatorAddress,
				_currentBatch.maticXBurned //maticXBurned
			)
		);

		partner[totalMaticStaked] -= _maticAmount;
		partner[totalMaticX] -= maticXAmount;
	}

	function getAllUnstakingRequests()
		external
		view
		returns (UnstakeRequest[])
	{
		return unstakeRequests;
	}

	function withdrawUnstakedAmount(uint256 _reqIdx) external onlyFoundation {
		require(
			_reqIdx >= 0 && _reqIdx < unstakeRequests.length,
			"Invalid Request Index"
		);
		UnstakeRequest memory currentRequest = unstakeRequests[_reqIdx];
		require(
			currentRequest.partnerId > 0,
			"Not a foundation unstake request"
		);
		uint256 amountToClaim = IMaticX(maticX).claimWithdrawal(_reqIdx);

		unstakeRequests[_reqIdx] = unstakeRequests[unstakeRequests.length - 1];
		unstakeRequests.pop();

		IERC20Upgradeable(polygonERC20).safeTransfer(
			_msgSender(),
			amountToClaim
		);
	}

	function addDueRewardsToCurrentBatch(uint32[] _partnerIds)
		external
		onlyManager
		returns (Batch)
	{
		Batch memory _currentBatch = batches[currentBatchId];
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
		// save changes to storage
		batches[currentBatchId] = _currentBatch;

		return _currentBatch;
	}

	function unDelegateCurrentBatch() external onlyManager returns (Batch) {
		uint32 _batchId = currentBatchId;
		Batch memory _currentBatch = batches[_batchId];
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
		uint32 _idx = unstakeRequests.length;
		WithdrawalRequest memory _withdrawalRequest = (
			IMaticX(_maticX).getUserWithdrawalRequests(address(this))
		)[_idx];
		unstakeRequests.push(
			UnstakeRequest(
				0, // partnerId
				_batchId,
				_withdrawalRequest.validatorNonce,
				_withdrawalRequest.requestEpoch,
				_withdrawalRequest.validatorAddress,
				_currentBatch.maticXBurned //maticXBurned
			)
		);

		batches[_batchId].undelegatedAt = uint64(block.timestamp);
		batches[_batchId].withdrawalEpoch = uint64(
			_withdrawalRequest.requestEpoch
		);
		batches[_batchId].status = BatchStatus.UNDELEGATED;

		// create a new batch
		currentBatchId += 1;
		batches[currentBatchId] = Batch(
			uint64(block.timestamp), // createdAt
			0,
			0,
			0,
			0,
			0,
			BatchStatus.CREATED
		);

		return batches[_batchId];
	}

	function claimUnstakeRewards(uint32 _reqIdx)
		external
		onlyManager
		returns (Batch)
	{
		require(
			_reqIdx >= 0 && _reqIdx < unstakeRequests.length,
			"Invalid Request Index"
		);
		require(
			unstakeRequests[_reqIdx].batchId > 0,
			"Not a partner reward unstake request"
		);
		Batch memory _currentBatch = batches[_batchId];
		require(
			_currentBatch.status == BatchStatus.UNDELEGATED,
			"Invalid Batch Status"
		);

		uint256 _maticReceived = IMaticX(maticX).claimWithdrawal(_reqIdx);

		unstakeRequests[_reqIdx] = unstakeRequests[unstakeRequests.length - 1];
		unstakeRequests.pop();

		batches[_batchId].maticReceived = _maticReceived;
		batches[_batchId].claimedAt = uint64(block.timestamp);
		batches[_batchId].status = BatchStatus.CLAIMED;

		return _currentBatch;
	}

	function disbursePartnerReward(uint32 _batchId, uint32[] _partnerIds)
		external
		onlyManager
		returns (Batch)
	{
		Batch memory _currentBatch = batches[_batchId];
		require(
			_currentBatch.status == BatchStatus.CLAIMED,
			"Batch Rewards hasn't been claimed yet"
		);

		for (uint32 i = 0; i < _partnerIds.length; i++) {
			uint32 _partnerId = _partnerIds[i];
			PartnerUnstakeShare memory _partnerShare = _currentBatch
				.partnersShare[_partnerId];
			require(_partnerShare.maticXUsed > 0, "Invalid PartnerId");
			require(
				_partnerShare.isDisbursed == true,
				"Partner Reward has already been disbursed"
			);

			uint256 _maticShare = (_partnerShare.maticXUnstaked *
				_currentBatch.maticReceived) / _currentBatch.maticXBurned;

			// save the state
			batches[_batchId].partnersShare[_partnerId].isDisbursed == true;

			// transfer rewards
			IERC20Upgradeable(polygonERC20).safeTransfer(
				partners[_partnerId].walletAddress,
				_maticShare
			);
			emit PartnerActivity(
				block.timestamp,
				_maticShare,
				_partnerShare.maticXUsed,
				PartnerActivityType.AUTO_DISBURSED
			);
		}

		return _currentBatch;
	}
}
