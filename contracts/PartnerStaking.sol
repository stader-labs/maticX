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

	function initialize(address _foundation, address _maticX, address _manager)
		external
		initializer
	{

		__AccessControl_init();
		__Pausable_init();

		foundation = _foundation;
		maticX = _maticX;
		manager = _manager;
		totalPartnerCount = 0;
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
			"This partner is already registered with stader"
		);
		uint _partnerId = totalPartnerCount + 1;
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
	function getAllPartnerDetails(uint _startId, uint _count)
		external
		view
		onlyFoundation
		returns (Partner[])
	{
		Partner[] memory result;
		for(uint i=_startId; i<=_startId + _count; i++){
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
		require(
			partner.status == PartnerStatus.ACTIVE,
			"Inactive Partner"
		);
		// approve? should i transfer to the contract first?
		uint256 _maticXAmount = IMaticX(_maticX).submit(_maticAmount);
		partner[totalMaticStaked] += _maticAmount;
		partner[totalMaticX] += _maticXAmount;
	}

	function unStake(uint256 _partnerId, uint256 _maticAmount)
		external
		onlyFoundation
	{
		// check for partnerId, amount
		// calculate equivalent maticX value
		// call unDelegate function on MaticX contract (with maticX from contract account)
		// synnc unstakeRequests and withdrawRequests on MATICX contract for this address
		// update the partners mapping (maticX, maticStaked)
		// log foundation activity
		require(
			_partnerId > 0 && _partnerId <= partnerCount,
			"Invalid or Unregistered PartnerId"
		);
		Partner storage partner = partners[_partnerId];
		require(
			_maticAmount > 0 && _maticAmount <= partner.totalMaticStaked,
			"Invalid amount"
		);

		(uint256 maticXAmount, , ) = IMaticX(_maticX).convertMaticToMaticX(
			_maticAmount
		);

		IMaticX(_maticX).requestWithdraw(maticXAmount);
		WithdrawalRequest memory maticXRequests = IMaticX(_maticX)
			.getUserWithdrawalRequests(address(this));
		uint256 currentIndex = unstakeRequests.length;
		unstakeRequests.push(
			UnstakeRequest(
				currentIndex,
				maticXRequests[currentIndex].validatorNonce,
				maticXRequests[currentIndex].requestEpoch,
				maticXRequests[currentIndex].validatorAddress,
				maticXAmount,
				_partnerId,
				UnstakeRequestType.FOUNDATION_UNSTAKE
			)
		);

		partner[totalMaticStaked] -= _maticAmount;
		partner[totalMaticX] -= maticXAmount;
		foundationLog.push(
			FoundationActivityLog(
				block.timestamp,
				_maticAmount,
				_partnerId,
				FoundationActivityType.UNSTAKED
			)
		);
	}

	function getUnstakingRequests(uint256 _partnerId)
		external
		view
		onlyFoundation
		returns (UnstakeRequest[])
	{
		// call getUserWithdrawalRequests on MaticX with contract address, and maticX
		UnstakeRequest[] memory requests;
		for (uint256 i = 0; i < unstakeRequests.length; i++) {
			if (
				unstakeRequests[i].partnerId == _partnerId &&
				unstakeRequests[i].requestType ==
				UnstakeRequestType.FOUNDATION_UNSTAKE
			) {
				requests.push(unstakeRequests[i]);
			}
		}
		return requests;
	}

	function withdrawUnstakedAmount(uint256 _index) external onlyFoundation {
		// call claimWithdrawal on MaticX
		// transfer matic from contract address to foundation address
		// update the unstakeRequests array
		// log foundation activity
		UnstakeRequest memory currentRequest = unstakeRequests[_index];
		require(
		currentRequest.index > 0 &&
			currentRequest.requestType == UnstakeRequestType.FOUNDATION_UNSTAKE,
			"Invalid request"
		);
		uint256 amountToClaim = IMaticX(_maticX).claimWithdrawal(_index);

		foundationLog.push(
			FoundationActivityLog(
				block.timestamp,
				amountToClaim,
				unstakeRequests[_requestIndex].partnerId,
				FoundationActivityType.CLAIMED
			)
		);

		unstakeRequests[_index] = unstakeRequests[unstakeRequests.length - 1];
		unstakeRequests[_index].index = _index;
		unstakeRequests.pop();

		IERC20Upgradeable(polygonERC20).safeTransfer(_msgSender(), amountToClaim);
	}

	function createUndelegationBatch(uint32 _batchPartnerCount) external onlyManager returns (uint32) {
		require(_batchPartnerCount > 0 && _batchPartnerCount <= totalPartnerCount, 'Invalid PartnerCount');
		(uint256 _maticXRate, , ) = IMaticX(_maticX).convertMaticToMaticX(100);
	    uint32 _batchId = currentBatchId+1;
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
		return _batchId;
	}

	function addPartnerToBatch(uint32 _batchId, uint32 _partnerId) external onlyManager returns (Batch) {
		Batch memory _currentBatch = batches[_batchId];
		require(_currentBatch.partnerCount > 0, 'Invalid BatchId');
		require(_currentBatch.status == BatchStatus.CREATED, 'Invalid Batch Status');

		Partner memory _currentPartner = partners[_partnerId];
		require(_currentPartner.walletAddress != address(0), 'Invalid PartnerId');

		uint256 _partnerMaticX = _currentPartner.totalMaticX - ((_currentPartner.totalMaticStaked * _currentBatch.maticXRate) / 100);

		_currentPartner.totalMaticX -= _partnerMaticX;

		_currentBatch.maticXBurned += _partnerMaticX;
		_currentBatch.partnersShare[_partnerId] = PartnerUnstakeShare(_partnerMaticX, false);
		_currentBatch.currentPartnerCount += 1;

		require(_currentBatch.currentPartnerCount <= _currentBatch.totalPartnerCount, 'Partner Count exceeding');

		// save changes to storage
		partners[_partnerId] = _currentPartner;
		batches[_batchId] = _currentBatch;

		return _currentBatch;
	}

	function unDelegateBatch(uint32 _batchId) external onlyManager returns (Batch) {
		Batch memory _currentBatch = batches[_batchId];
		require(_currentBatch.partnerCount > 0, 'Invalid BatchId');
		require(_currentBatch.status == BatchStatus.CREATED, 'Invalid Batch Status');
		require(_currentBatch.currentPartnerCount < _currentBatch.totalPartnerCount, 'Partner Count incomplete');

		_currentBatch.status = BatchStatus.DELEGATED;
		_currentBatch.currentPartnerCount = 0;
		IMaticX(_maticX).requestWithdraw(_currentBatch.maticXBurned);
		// will this give correct values all the time? because of eventual consistencies?
		WithdrawalRequest memory _maticXRequests = IMaticX(_maticX).getUserWithdrawalRequests(address(this));
		uint32 _idx = unstakeRequests.length;
		unstakeRequests.push(
			UnstakeRequest(
				_idx, // index
					_maticXRequests[_idx].validatorNonce,
					_maticXRequests[_idx].requestEpoch,
					_maticXRequests[_idx].validatorAddress,
					_currentBatch.maticXBurned, //maticXBurned
				0, // partnerId
					_batchId
			)
		);
		_currentBatch.withdrawalEpoch = uint64(_maticXRequests[_idx].requestEpoch);
	   batches[_batchId] = _currentBatch;

		return _currentBatch;
	}

	function claimBatchUndelegation(uint32 _batchId) external onlyManager returns (Batch) {
		Batch memory _currentBatch = batches[_batchId];
		require(_currentBatch.partnerCount > 0, 'Invalid BatchId');
		require(_currentBatch.status == BatchStatus.DELEGATED, 'Invalid Batch Status');

		// get request
		UnstakeRequest[] memory _requests = unstakeRequests;
		uint32 _index;
		for (uint32 i = 0; i < _requests.length; i++) {
			if (
				_requests[i].batchId == _batchId
			) {
				_index = i;
				break;
			}
		}

		uint256 _maticReceived = IMaticX(_maticX).claimWithdrawal(_index);

		_requests[_index] = _requests[_requests.length - 1];
		_requests[_index].index = _index;
		_requests.pop();

		unstakeRequests = _requests;

		_currentBatch.maticReceived = _maticReceived;
		_currentBatch.status = BatchStatus.CLAIMED;

		batches[_batchId]=_currentBatch;

		return _currentBatch;
	}

	function disbursePartnerReward (uint32 _batchId, uint32 _partnerId) external onlyManager returns (Batch) {
		Batch memory _currentBatch = batches[_batchId];
		require(_currentBatch.partnerCount > 0, 'Invalid BatchId');
		require(_currentBatch.status == BatchStatus.CLAIMED, 'Invalid Batch Status');
		require(_currentBatch.partnersShare[_partnerId].maticXUsed > 0, 'Invalid PartnerId');
		require(_currentBatch.partnersShare[_partnerId].isDisbursed == true, 'Partner Reward already disbursed');

		uint256 _maticShare = (_currentBatch.partnersShare[_partnerId].maticXUsed * _currentBatch.maticReceived) /
		_currentBatch.maticXBurned ;

		partnerLog[_partnerId].push(
			PartnerActivityLog(
				block.timestamp,
					_maticShare,
					_currentBatch.partnersShare[_partnerId].maticXUsed,
				PartnerActivityType.AUTO_DISBURSED
			)
		);
		_currentBatch.partnersShare[_partnerId].isDisbursed == true;
		batches[_batchId] = _currentBatch;

		IERC20Upgradeable(polygonERC20).safeTransfer(
			partners[_partnerId].walletAddress,
				_maticShare
		);

		return _currentBatch;
	}
}
