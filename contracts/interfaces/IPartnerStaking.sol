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

	mapping(uint32 => Partner) partners;
	mapping(address => uint32) partnerAddressToId;
	uint32 totalPartnerCount;

	enum PartnerActivityType {
		ClAIMED,
		AUTO_DISBURSED
	}
	struct PartnerActivityLog {
		uint64 timestamp;
		uint256 maticAmount;
		uint256 maticXUsed;
		PartnerActivityType activity;
	}
	mapping(uint32 => PartnerActivityLog[]) partnerLog;

	struct UnstakeRequest {
		uint32 index;
		uint256 validatorNonce;
		uint256 requestEpoch;
		address validatorAddress;
		uint256 maticXBurned;
		uint32 partnerId;
		uint32 batchId;
	}
	UnstakeRequest[] private unstakeRequests;

	struct PartnerUnstakeShare {
		uint256 maticXUsed;
		bool isDisbursed;
	}
	enum BatchStatus {
		CREATED,
		UNDELEGATED,
		CLAIMED,
		DISBURSED
	}
	struct Batch {
		uint64 createdAt;
		uint64 withdrawalEpoch;
		BatchStatus status;
		uint256 maticXRate; //100 matic value in maticX
		uint256 maticXBurned;
		uint256 maticReceived;
		uint32 totalPartnerCount;
		uint32 currentPartnerCount;
		mapping(uint32 => PartnerUnstakeShare) partnersShare;
	}
	mapping(uint32 => Batch) public batches;
	uint32 currentBatchId;
}
