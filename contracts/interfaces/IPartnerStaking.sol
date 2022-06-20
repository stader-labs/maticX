pragma solidity 0.8.7;

interface IPartnerStaking {
	enum PartnerStatus {
		ACTIVE,
		INACTIVE
	}
	struct Partner {
		string name;
		address walletAddress;
		string website;
		bytes metadata;
		uint64 registeredAt;
		uint256 totalMaticStaked;
		uint256 totalMaticX;
		PartnerStatus status;
	}

	mapping(uint32 => Partner) private partners;
	mapping(address => uint32) private partnerAddressToId;
	uint32 totalPartnerCount;

	enum PartnerActivityType {
		ClAIMED,
		AUTO_DISBURSED
	}
	event PartnerActivity(
		uint64 timestamp,
		uint256 maticAmount,
		uint256 maticXUsed,
		PartnerActivityType activity
	);

	///@@dev UI needs to differentiate between foundation unstake request and partner reward unstake request for a request, _batchId > 0 -> partner reward request, _partnerId > 0 -> foundation reward request
	struct UnstakeRequest {
		uint32 partnerId;
		uint32 batchId;
		uint256 maticXBurned;
	}

	UnstakeRequest[] public unstakeRequests;

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

	mapping(uint32 => Batch) public batches;
	uint32 currentBatchId;

	function registerPartner(
		address _partnerAddress,
		string _name,
		string _website,
		bytes _metadata
	) external returns (uint32);

	function getPartnerDetails(uint32 _partnerId)
		external
		view
		returns (Partner partner);

	function getPartners(uint32 _count, uint32 _offset)
		external
		view
		returns (Partner[]);

	function stake(uint32 _partnerId, uint256 _maticAmount) external;

	function unStake(uint32 _partnerId, uint256 _maticAmount) external;

	function withdrawUnstakedAmount(uint256 _reqIdx) external;

	function addDueRewardsToCurrentBatch(uint32[] _partnerIds)
		external
		returns (Batch);

	function unDelegateCurrentBatch() external returns (Batch);

	function claimUnstakeRewards(uint32 _reqIdx) external returns (Batch);

	function disbursePartnersReward(uint32 _batchId, uint32[] _partnerIds)
		external
		returns (Batch);
}
