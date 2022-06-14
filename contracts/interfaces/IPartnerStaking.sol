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
        uint256 registeredAt;
        uint256 totalMaticStaked;
        uint256 totalMaticX;
        PartnerStatus status;
    }

    mapping(uint => Partner) partners;
    mapping(address => uint) partnerAddresses;
    uint partnerCount;
    uint pageSize;

    enum PartnerActivityType {
        ClAIMED,
        AUTO_DISBURSED
    }

    struct PartnerActivityLog {
        uint256 timestamp;
        uint256 maticAmount;
        uint256 maticXUsed;
        PartnerActivityType activity;
    }

    enum FoundationActivityType {
        STAKED,
        UNSTAKED,
        CLAIMED
    }

    struct FoundationActivityLog {
        uint256 timestamp;
        uint256 maticAmount;
        uint256 partnerId;
        FoundationActivityType activity;
    }

    mapping(uint256 => PartnerActivityLog[]) partnerLog;
    FoundationActivityLog[] foundationLog;

    struct WithdrawalRequest {
        uint256 validatorNonce;
        uint256 requestEpoch;
        address validatorAddress;
    }

    enum UnstakeRequestType {
        FOUNDATION_UNSTAKE,
        PARTNER_REWARD_UNSTAKE
    }
    struct PartnerUnstakeShare {
        uint256 partnerId;
        uint256 maticXUsed;
    }
    struct UnstakeRequest {
        uint256 index;
        uint256 validatorNonce;
        uint256 requestEpoch;
        address validatorAddress;
        uint256 maticXBurned;
        uint256 partnerId;
        uint256 pageNumber;
        UnstakeRequestType requestType;
        PartnerUnstakeShare[] partnerShares;
    }

    UnstakeRequest[] private unstakeRequests;
    mapping (string => bool) unstakeRequestPageStatus;
}