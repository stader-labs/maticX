pragma solidity 0.8.7;

interface IPartnerStaking {
	function totalPartnerCount() external view returns (uint32);

	function currentBatchId() external view returns (uint32);

	function feePercent() external view returns (uint8);

	function feeReimbursalPool() external view returns (uint256);

	enum DisbursalCycleType {
		WEEK,
		FORTNIGHT,
		MONTH,
		QUARTER,
		YEAR
	}
	enum PartnerStatus {
		ACTIVE,
		INACTIVE
	}
	struct Partner {
		uint32 remDisbursals;
		uint32 disbursalCount;
		uint64 registeredAt;
		uint256 totalMaticStaked;
		uint256 totalMaticX;
		uint256 pastManualRewards;
		address walletAddress;
		string name;
		string website;
		bytes metadata;
		PartnerStatus status;
		DisbursalCycleType disbursalCycle;
	}

	enum PartnerActivityType {
		ClAIMED,
		AUTO_DISBURSED
	}
	event PartnerActivity(
		uint256 timestamp,
		uint256 maticAmount,
		uint256 reimbursedFee,
		uint256 maticXUsed,
		PartnerActivityType activity
	);
	event SetTrustedForwarder(address _address);
	event SetDisbursalBot(address _address);
	event SetFeePercent(uint8 _feePercent);

	///@@dev UI needs to differentiate between foundation unstake request and partner reward unstake request for a request, _batchId > 0 -> partner reward request, _partnerId > 0 -> foundation reward request
	struct UnstakeRequest {
		uint32 partnerId;
		uint32 batchId;
		uint256 maticXBurned;
	}

	struct PartnerUnstakeShare {
		uint256 maticXUnstaked;
		bool isDisbursed;
	}
	enum BatchStatus {
		CREATED,
		UNDELEGATED,
		CLAIMED
	}
	struct Batch {
		uint64 createdAt;
		uint64 undelegatedAt;
		uint64 claimedAt;
		uint64 withdrawalEpoch;
		uint256 maticXBurned;
		uint256 maticReceived;
		BatchStatus status;
		mapping(uint32 => PartnerUnstakeShare) partnersShare;
	}

	function setDisbursalBot(address _address) external;

	function setTrustedForwarder(address _address) external;

	function setFeePercent(uint8 _feePercent) external;

	function provideFeeReimbursalMatic(uint256 _amount) external;

	function registerPartner(
		address _walletAddress,
		string calldata _name,
		string calldata _website,
		bytes calldata _metadata,
		DisbursalCycleType _disbursalCycle,
		uint32 _totalFrequency,
		uint256 _pastManualRewards
	) external returns (uint32);

	function changePartnerWalletAddress(
		uint32 _partnerId,
		address _newWalletAddress
	) external returns (Partner memory);

	function changePartnerStatus(uint32 _partnerId, bool _isActive)
		external
		returns (Partner memory);

	function changePartnerDisbursalCount(
		uint32 _partnerId,
		uint32 _newDisbursalCount
	) external returns (Partner memory);

	function getPartnerDetails(uint32 _partnerId)
		external
		view
		returns (Partner memory);

	function getPartners(uint32 _count, uint32 _offset)
		external
		view
		returns (Partner[] memory);

	function stake(uint32 _partnerId, uint256 _maticAmount) external;

	function unStake(uint32 _partnerId, uint256 _maticAmount) external;

	function withdrawUnstakedAmount(uint256 _reqIdx) external;

	function addDueRewardsToCurrentBatch(uint32[] calldata _partnerIds)
		external;

	function unDelegateCurrentBatch() external;

	function claimUnstakeRewards(uint32 _reqIdx) external;

	function disbursePartnersReward(
		uint32 _batchId,
		uint32[] calldata _partnerIds
	) external;
}
