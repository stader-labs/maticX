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
		uint256 _maticXAmount = IMaticX(_maticX).submit(_maticAmount);
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

		(uint256 _maticXAmount, , ) = IMaticX(_maticX).convertMaticToMaticX(
			_maticAmount
		);

		IMaticX(_maticX).requestWithdraw(_maticXAmount);

		uint32 _idx = unstakeRequests.length;
		WithdrawalRequest memory _withdrawalRequest = (
			IMaticX(_maticX).getUserWithdrawalRequests(address(this))
		)[_idx];
		unstakeRequests.push(
			UnstakeRequest(
				_withdrawalRequest.validatorNonce,
				_withdrawalRequest.requestEpoch,
				_withdrawalRequest.validatorAddress,
				_currentBatch.maticXBurned, //maticXBurned
				_partnerId, // partnerId
				0 // batchId
			)
		);

		partner[totalMaticStaked] -= _maticAmount;
		partner[totalMaticX] -= maticXAmount;
	}

	function getAllUnstakingRequests()
		external
		view
		onlyFoundation
		onlyManager
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
		uint256 amountToClaim = IMaticX(_maticX).claimWithdrawal(_reqIdx);

		unstakeRequests[_reqIdx] = unstakeRequests[unstakeRequests.length - 1];
		unstakeRequests.pop();

		IERC20Upgradeable(polygonERC20).safeTransfer(
			_msgSender(),
			amountToClaim
		);
	}

	function createUndelegationBatch(uint32 _batchPartnerCount)
		external
		onlyManager
		returns (uint32)
	{
		// check that earlier batch is not in a limbo state
		require(
			batches[currentBatchId].status != BatchStatus.CREATED,
			"Earlier Batch has not undelegated yet"
		);
		require(
			_batchPartnerCount > 0 && _batchPartnerCount <= totalPartnerCount,
			"Invalid PartnerCount"
		);
		(uint256 _maticXRate, , ) = IMaticX(_maticX).convertMaticToMaticX(100);
		uint32 _batchId = currentBatchId + 1;
		batches[_batchId] = Batch(
			uint64(block.timestamp), //createdAt
			0, //withdrawalEpoch
			BatchStatus.CREATED, //status
			_maticXRate, //maticXRate
			0, //maticXUsed
			0, //maticReceived
			_batchPartnerCount,
			0
		);
		currentBatchId = _batchId;
		return _batchId;
	}

	function addPartnerToBatch(uint32 _batchId, uint32 _partnerId)
		external
		onlyManager
		returns (Batch)
	{
		Batch memory _currentBatch = batches[_batchId];
		require(_currentBatch.partnerCount > 0, "Invalid BatchId");
		require(
			_currentBatch.status == BatchStatus.CREATED,
			"Invalid Batch Status"
		);

		Partner memory _currentPartner = partners[_partnerId];
		require(
			_currentPartner.walletAddress != address(0),
			"Invalid PartnerId"
		);

		uint256 _partnerMaticX = _currentPartner.totalMaticX -
			((_currentPartner.totalMaticStaked * _currentBatch.maticXRate) /
				100);

		_currentPartner.totalMaticX -= _partnerMaticX;

		_currentBatch.maticXBurned += _partnerMaticX;
		_currentBatch.partnersShare[_partnerId] = PartnerUnstakeShare(
			_partnerMaticX,
			false
		);
		_currentBatch.currentPartnerCount += 1;

		require(
			_currentBatch.currentPartnerCount <=
				_currentBatch.totalPartnerCount,
			"Partner Count exceeding"
		);

		// save changes to storage
		partners[_partnerId] = _currentPartner;
		batches[_batchId] = _currentBatch;

		return _currentBatch;
	}

	function unDelegateBatch(uint32 _batchId)
		external
		onlyManager
		returns (Batch)
	{
		Batch memory _currentBatch = batches[_batchId];
		require(_currentBatch.partnerCount > 0, "Invalid BatchId");
		require(
			_currentBatch.status == BatchStatus.CREATED,
			"Invalid Batch Status"
		);
		require(
			_currentBatch.currentPartnerCount < _currentBatch.totalPartnerCount,
			"Partner Count incomplete"
		);

		_currentBatch.status = BatchStatus.UNDELEGATED;
		_currentBatch.currentPartnerCount = 0;
		IMaticX(_maticX).requestWithdraw(_currentBatch.maticXBurned);
		uint32 _idx = unstakeRequests.length;
		WithdrawalRequest memory _withdrawalRequest = (
			IMaticX(_maticX).getUserWithdrawalRequests(address(this))
		)[_idx];
		unstakeRequests.push(
			UnstakeRequest(
				_withdrawalRequest.validatorNonce,
				_withdrawalRequest.requestEpoch,
				_withdrawalRequest.validatorAddress,
				_currentBatch.maticXBurned, //maticXBurned
				0, // partnerId
				_batchId
			)
		);
		_currentBatch.withdrawalEpoch = uint64(_withdrawalRequest.requestEpoch);
		batches[_batchId] = _currentBatch;

		return _currentBatch;
	}

	function claimBatchUndelegation(uint32 _reqIdx)
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

		uint256 _maticReceived = IMaticX(_maticX).claimWithdrawal(_reqIdx);

		unstakeRequests[_reqIdx] = unstakeRequests[unstakeRequests.length - 1];
		unstakeRequests.pop();

		_currentBatch.maticReceived = _maticReceived;
		_currentBatch.status = BatchStatus.CLAIMED;

		batches[_batchId] = _currentBatch;

		return _currentBatch;
	}

	function disbursePartnerReward(uint32 _batchId, uint32 _partnerId)
		external
		onlyManager
		returns (Batch)
	{
		Batch memory _currentBatch = batches[_batchId];
		require(_currentBatch.partnerCount > 0, "Invalid BatchId");
		require(
			_currentBatch.status == BatchStatus.CLAIMED,
			"Invalid Batch Status"
		);
		require(
			_currentBatch.partnersShare[_partnerId].maticXUsed > 0,
			"Invalid PartnerId"
		);
		require(
			_currentBatch.partnersShare[_partnerId].isDisbursed == true,
			"Partner Reward already disbursed"
		);

		uint256 _maticShare = (_currentBatch
			.partnersShare[_partnerId]
			.maticXUsed * _currentBatch.maticReceived) /
			_currentBatch.maticXBurned;

		_currentBatch.partnersShare[_partnerId].isDisbursed == true;
		_currentBatch.currentPartnerCount += 1;
		if (
			_currentBatch.currentPartnerCount == _currentBatch.totalPartnerCount
		) {
			_currentBatch.status = BatchStatus.DISBURSED;
		}
		batches[_batchId] = _currentBatch;

		IERC20Upgradeable(polygonERC20).safeTransfer(
			partners[_partnerId].walletAddress,
			_maticShare
		);
		emit PartnerActivity(
			block.timestamp,
			_maticShare,
			_currentBatch.partnersShare[_partnerId].maticXUsed,
			PartnerActivityType.AUTO_DISBURSED
		);

		return _currentBatch;
	}
}
