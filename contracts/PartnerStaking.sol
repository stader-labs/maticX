// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../contracts/interfaces/IPartnerStaking.sol";
import "../contracts/lib/DateTime.sol";

contract PartnerStaking is
    IPartnerStaking,
	Initializable,
	AccessControlUpgradeable,
	PausableUpgradeable
{
	using DateTime for uint;
	using SafeERC20Upgradeable for IERC20Upgradeable;

	address private foundation;
	address private maticX;

	function initialize(address _foundation, address _maticX)
		external
		initializer
	{
		foundation = _foundation;
		maticX = _maticX;
		maticXContract = IMaticX(_maticX);
		partnerCount = 0;
		pageSize = 10;
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

	function registerPartner(
		address _partnerAddress,
		string _name,
		string _website,
		bytes _metadata
	) external onlyFoundation returns (uint256) {
		require(
			partnerAddresses[_partnerAddress] == 0,
			"This partner is already registered with stader"
		);
		uint _partnerId = partnerCount + 1;
		partners[_partnerId] = Partner(
			_name,
			_partnerAddress,
			website,
			_metadata,
			block.timestamp,
			0, // totalMaticStaked
			0, // totalMaticX
			PartnerStatus.ACTIVE
		);
		partnerAddresses[_partnerAddress] = _partnerId;
		partnerCount = _partnerId;
		return partnerId;
	}

	function getPartnerDetails(uint256 _partnerId)
		external
		view
		onlyFoundation
		returns (Partner partner)
	{
		return partners[_partnerId];
	}

	// paginated
	function getAllPartnerDetails()
		external
		view
		onlyFoundation
		returns (Partner[])
	{
		Partner[] memory result;
		uint _totalPartnerCount = totalPartnerCount;
		for(uint i=1; i<=_totalPartnerCount; i++){
			result.push(partners[i]);
		}
		return result;
	}

	function stake(uint256 _partnerId, uint256 _maticAmount)
		external
		onlyFoundation
	{
		// check for partnerId, amount
		// log foundation activity
		// call submit function on MaticX
		// transfer maticX to contract address
		// update the partners mapping (maticX, maticStaked)
		require(
			_partnerId > 0 && _partnerId <= partnerCount,
			"Invalid or Unregistered PartnerId"
		);
		require(_maticAmount > 0, "Invalid amount");
		Partner storage partner = partners[_partnerId];
		// approve? should i transfer to the contract first?
		uint256 _maticXAmount = maticXContract.submit(_maticAmount);
		partner[totalMaticStaked] += _maticAmount;
		partner[totalMaticX] += _maticXAmount;
		foundationLog.push(
			FoundationActivityLog(
				block.timestamp,
				_maticAmount,
				_partnerId,
				FoundationActivityType.STAKED
			)
		);
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

		(uint256 maticXAmount, , ) = maticXContract.convertMaticToMaticX(
			_maticAmount
		);
		// approve?

		maticXContract.requestWithdraw(maticXAmount);
		WithdrawalRequest memory maticXRequests = maticXContract
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
			currentRequest.requestType == UnstakeRequestType.FOUNDATION_UNSTAKE,
			"Invalid request"
		);
		uint256 amountToClaim = maticXContract.claimWithdrawal(_index);

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

		IERC20Upgradeable(polygonERC20).safeTransfer(msg.sender, amountToClaim);
	}

	function undelegatePartnerRewards(uint _pageNumber) {
		// get currentTimestamp, currentDate
		// get the partnerIds for this pageNumber
		// TODO : check for querterly or monthly schedule (month)
		// for all partners, get the rewards accrued (maticX - totalMaticStaked), deduct extra matic from the partner
		// cumulative maticX = mx1 + mx2 + .....
		// undelegate cumulative maticX
		// map rewards to partner


		uint _pageSize = pageSize;
		uint _partnerCount = partnerCount;

		// check for _pageNumber validity
		require((_pageNumber-1)*_pageSize < _partnerCount, "Invalid PageNumber");

		// check for duplicatePageNumber (re-entrancy bug?)
		uint timestamp = block.timestamp;
		(year, month, day) = DateTime.timestampToDate(timestamp);
		string key = keccak256(abi.encodePacked(year,'-',month,'-',day,'-',_pageNumber));
		require(!unstakeRequestPageStatus[key], "Duplicate Request");
		unstakeRequestPageStatus[key] = true;


		(uint256 maticXRate, , ) = maticXContract.convertMaticToMaticX(100);
		PartnerUnstakeShare[] memory partnerShares;
		uint256 cumulativeMaticXReward = 0;
		uint startingId = (_pageNumber-1)*_pageSize + 1;
		uint lastId = (_pageNumber)*_pageSize < _partnerCount ? (_pageNumber)*_pageSize : _partnerCount;

		for (uint i = startingId; i <= lastId;  i++) {
			Partner memory currentPartner = partners[i];
			uint256 maticXReward = currentPartner.totalMaticX -
				((currentPartner.totalMaticStaked * maticXRate) / 100);
			cumulativeMaticXReward += maticXReward;
			currentPartner.totalMaticX -= maticXReward;
			partnerShares.push(PartnerUnstakeShare(i, maticXReward));
		}

		maticXContract.requestWithdraw(cumulativeMaticXReward);
		WithdrawalRequest memory maticXRequests = maticXContract
			.getUserWithdrawalRequests(address(this));
		uint256 currentIndex = unstakeRequests.length;
		unstakeRequests.push(
			UnstakeRequest(
				currentIndex,
				maticXRequests[currentIndex].validatorNonce,
				maticXRequests[currentIndex].requestEpoch,
				maticXRequests[currentIndex].validatorAddress,
				cumulativeMaticXReward,
				0,
				_pageNumber,
				UnstakeRequestType.PARTNER_REWARD_UNSTAKE,
				partnerShares
			)
		);
	}

	function getPartnerRewardUnstakeRequests() {
		UnstakeRequest[] memory requests;
		for (uint256 i = 0; i < unstakeRequests.length; i++) {
			if (
				unstakeRequests[i].requestType ==
				UnstakeRequestType.PARTNER_REWARD_UNSTAKE
			) {
				requests.push(unstakeRequests[i]);
			}
		}
		return requests;
	}

	function claimAndDisbursePartnerRewards(uint256 _index) {
		UnstakeRequest memory currentRequest = unstakeRequests[_index];
		require(
			currentRequest.requestType ==
				UnstakeRequestType.PARTNER_REWARD_UNSTAKE,
			"Invalid request"
		);
		uint256 totalMatic = maticXContract.claimWithdrawal(_index);
		unstakeRequests[_index] = unstakeRequests[unstakeRequests.length - 1];
		unstakeRequests[_index].index = _index;
		unstakeRequests.pop();
		for (uint256 i = 0; i < currentRequest.partnerShares.length; i++) {
			PartnerUnstakeShare memory currentPartnerShare = currentRequest
				.partnerShares[i];
			Partner memory currentPartner = partners[
				currentPartnerShare.partnerId
			];
			uint256 maticShare = (currentPartnerShare.maticXUsed /
				currentRequest.maticXBurned) * totalMatic;
			partnerLog[currentPartnerShare.partnerId].push(
				PartnerActivityLog(
					block.timestamp,
					maticShare,
					currentPartnerShare.maticXUsed,
					PartnerActivityType.AUTO_DISBURSED
				)
			);
			IERC20Upgradeable(polygonERC20).safeTransfer(
				currentPartner.walletAddress,
				maticShare
			);
		}
	}

}
