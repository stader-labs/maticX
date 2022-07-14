pragma solidity 0.8.7;

interface IPartnerStaking {
	function currentPartnerId() external view returns (uint32);

	function currentBatchId() external view returns (uint32);

	function feeReimbursalPercent() external view returns (uint8);

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
		uint32 disbursalRemaining;
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

	///@@dev UI needs to differentiate between foundation unstake request and partner reward unstake request for a request, _batchId > 0 -> partner reward request, _partnerId > 0 -> foundation reward request
	struct UnstakeRequest {
		uint32 partnerId;
		uint32 batchId;
		uint256 maticXBurned;
	}

	struct PartnerUnstakeShare {
		uint256 maticXUnstaked;
		uint64 disbursedAt;
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

	//events
	event AddFoundationApprovedAddress(address _address, uint256 _timestamp);

	event RemoveFoundationApprovedAddress(address _address, uint256 _timestamp);

	event SetDisbursalBotAddress(address _address, uint256 _timestamp);

	event SetTrustedForwarder(address _address);

	event SetFeeReimbursalPercent(
		uint8 _feeReimbursalPercent,
		uint256 _timestamp
	);

	event ProvideFeeReimbursalMatic(uint256 _amount, uint256 _timestamp);

	event RegisterPartner(
		uint32 indexed _partnerId,
		address indexed _walletAddress,
		uint256 _timestamp
	);

	event ChangePartnerWalletAddress(
		uint32 indexed _partnerId,
		address indexed _oldWalletAddress,
		address indexed _newWalletAddress,
		uint256 _timestamp
	);

	event ChangePartnerDisbursalCount(
		uint32 indexed partnerId,
		uint32 _newDisbursalCount,
		uint256 _timestamp
	);

	event ChangePartnerStatus(
		uint32 indexed _partnerId,
		address indexed _partnerAddress,
		bool _isActive,
		uint256 _timestamp
	);

	event FoundationStake(
		uint32 indexed _partnerId,
		address indexed _partnerAddress,
		uint256 _maticAmount,
		uint256 _maticXMinted,
		uint256 _timestamp
	);

	event FoundationUnStake(
		uint32 indexed _partnerId,
		address indexed _partnerAddress,
		uint256 _maticAmount,
		uint256 _maticXBurned,
		uint256 _timestamp
	);

	event FoundationWithdraw(
		uint256 _reqIdx,
		uint256 _maticAmount,
		uint256 _timestamp
	);

	event CreateBatch(uint32 indexed _batchId, uint256 _timestamp);

	event UndelegateBatch(
		uint32 indexed _batchId,
		uint256 _maticXBurned,
		uint256 _timestamp
	);

	event ClaimBatch(
		uint32 indexed _batchId,
		uint256 _maticAmount,
		uint256 _timestamp
	);

	event UnstakePartnerReward(
		uint32 indexed _partnerId,
		address indexed _partnerAddress,
		uint32 indexed _batchId,
		uint256 _maticXUnstaked,
		uint256 _timestamp
	);

	event DisbursePartnerReward(
		uint32 indexed _partnerId,
		address indexed _partnerAddress,
		uint32 indexed _batchId,
		uint256 _maticDisbursed,
		uint256 _reimbursedFee,
		uint256 _maticXUsed,
		uint256 _timestamp
	);

	function approveBalanceOnMaticX(uint256 balance) external;

	function addFoundationApprovedAddress(address _address) external;

	function removeFoundationApprovedAddress(address _address) external;

	function setDisbursalBotAddress(address _address) external;

	function setTrustedForwarder(address _address) external;

	function setFeeReimbursalPercent(uint8 _feeReimbursalPercent) external;

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

	function stake(uint32 _partnerId, uint256 _maticAmount) external;

	function unStake(uint32 _partnerId, uint256 _maticAmount) external;

	function withdrawUnstakedAmount(uint256 _reqIdx) external;

	function addDueRewardsToCurrentBatch(uint32[] calldata _partnerIds)
		external;

	function unDelegateCurrentBatch() external;

	function getPartnerShare(uint32 _batchId, uint32 _partnerId)
		external
		view
		returns (PartnerUnstakeShare memory);

	function claimUnstakeRewards(uint32 _reqIdx) external;

	function disbursePartnersReward(
		uint32 _batchId,
		uint32[] calldata _partnerIds
	) external;
}
