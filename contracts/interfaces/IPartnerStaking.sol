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

	enum PartnerActivityType {
		ClAIMED,
		AUTO_DISBURSED
	}
	event PartnerActivity(
		uint256 timestamp,
		uint256 maticAmount,
		uint256 maticXUsed,
		PartnerActivityType activity
	);
	event SetTrustedForwarder(address _address);

	struct WithdrawalRequest {
		uint256 validatorNonce;
		uint256 requestEpoch;
		address validatorAddress;
	}

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

	function setTrustedForwarder(address _address) external;

	function registerPartner(
		address _partnerAddress,
		string calldata _name,
		string calldata _website,
		bytes calldata _metadata
	) external returns (uint32);

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
