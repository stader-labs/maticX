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

	struct UnstakeRequest {
		uint32 partnerId;
		uint32 batchId;
		uint256 validatorNonce;
		uint256 requestEpoch;
		address validatorAddress;
		uint256 maticXBurned;
	}
	UnstakeRequest[] private unstakeRequests;

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
	mapping(uint32 => Batch) private batches;
	uint32 currentBatchId;
}
