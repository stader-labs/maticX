// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "./interfaces/INodeOperatorRegistry.sol";
import "./interfaces/IMaticX.sol";
import "./interfaces/IStakeManager.sol";

/// @title NodeOperatorRegistry
/// @notice NodeOperatorRegistry is the main contract that manage validators
/// @dev NodeOperatorRegistry is the main contract that manage operators.
contract NodeOperatorRegistry is
    INodeOperatorRegistry,
    PausableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    enum NodeOperatorStatus {
        INACTIVE,
        ACTIVE,
        STOPPED,
        UNSTAKED,
        CLAIMED,
        EXIT,
        JAILED,
        EJECTED
    }
    /// @notice The node operator struct
    /// @param status node operator status(INACTIVE, ACTIVE, STOPPED, CLAIMED, UNSTAKED, EXIT, JAILED, EJECTED).
    /// @param name node operator name.
    /// @param rewardAddress Validator public key used for access control and receive rewards.
    /// @param validatorId validator id of this node operator on the polygon stake manager.
    /// @param signerPubkey public key used on heimdall.
    /// @param validatorShare validator share contract used to delegate for on polygon.
    /// @param validatorProxy the validator proxy, the owner of the validator.
    /// @param commissionRate the commission rate applied by the operator on polygon.
    /// @param maxDelegateLimit max delegation limit that MaticX contract will delegate to this operator each time delegate function is called.
    struct NodeOperator {
        NodeOperatorStatus status;
        string name;
        address rewardAddress;
        bytes signerPubkey;
        address validatorShare;
        address validatorProxy;
        uint256 validatorId;
        uint256 commissionRate;
        uint256 maxDelegateLimit;
    }

    /// @notice all the roles.
    bytes32 public constant REMOVE_OPERATOR_ROLE =
        keccak256("STADER_REMOVE_OPERATOR");
    bytes32 public constant PAUSE_OPERATOR_ROLE =
        keccak256("STADER_PAUSE_OPERATOR");
    bytes32 public constant DAO_ROLE = keccak256("STADER_DAO");

    /// @notice contract version.
    string public version;
    /// @notice total node operators.
    uint256 private totalNodeOperators;

    /// @notice stakeManager address.
    address private stakeManager;
    /// @notice polygonERC20 token (Matic) address.
    address private polygonERC20;
    /// @notice maticX address.
    address private maticX;

    /// @notice keeps track of total number of operators
    uint256 nodeOperatorCounter;

    /// @notice min amount allowed to stake per validator.
    uint256 public minAmountStake;

    /// @notice min HeimdallFees allowed to stake per validator.
    uint256 public minHeimdallFees;

    /// @notice commision rate applied to all the operators.
    uint256 public commissionRate;

    /// @notice allows restake.
    bool public allowsRestake;

    /// @notice default max delgation limit.
    uint256 public defaultMaxDelegateLimit;

    /// @notice This stores the operators ids.
    uint256[] private operatorIds;

    /// @notice Mapping of all owners with node operator id. Mapping is used to be able to
    /// extend the struct.
    mapping(address => uint256) private operatorOwners;


    /// @notice Mapping of all node operators. Mapping is used to be able to extend the struct.
    mapping(uint256 => NodeOperator) private operators;

    /// --------------------------- Modifiers-----------------------------------

    /// @notice Check if the msg.sender has permission.
    /// @param _role role needed to call function.
    modifier userHasRole(bytes32 _role) {
        checkCondition(hasRole(_role, msg.sender), "unauthorized");
        _;
    }

    /// @notice Check if the amount is inbound.
    /// @param _amount amount to stake.
    modifier checkStakeAmount(uint256 _amount) {
        checkCondition(_amount >= minAmountStake, "Invalid amount");
        _;
    }

    /// @notice Check if the heimdall fee is inbound.
    /// @param _heimdallFee heimdall fee.
    modifier checkHeimdallFees(uint256 _heimdallFee) {
        checkCondition(_heimdallFee >= minHeimdallFees, "Invalid fees");
        _;
    }

    /// @notice Check if the maxDelegateLimit is less or equal to 10 Billion.
    /// @param _maxDelegateLimit max delegate limit.
    modifier checkMaxDelegationLimit(uint256 _maxDelegateLimit) {
        checkCondition(
            _maxDelegateLimit <= 10000000000 ether,
            "Max amount <= 10B"
        );
        _;
    }

    /// @notice Check if the rewardAddress is already used.
    /// @param _rewardAddress new reward address.
    modifier checkIfRewardAddressIsUsed(address _rewardAddress) {
        checkCondition(
            operatorOwners[_rewardAddress] == 0 && _rewardAddress != address(0),
            "Address used"
        );
        _;
    }

    /// -------------------------- initialize ----------------------------------

    /// @notice Initialize the NodeOperator contract.
    function initialize(
        address _stakeManager,
        address _polygonERC20,
        address _maticX
    ) external initializer {
        __Pausable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();

        stakeManager = _stakeManager;
        polygonERC20 = _polygonERC20;
        maticX = _maticX;

        minAmountStake = 10 * 10**18;
        minHeimdallFees = 20 * 10**18;
        defaultMaxDelegateLimit = 10 ether;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(REMOVE_OPERATOR_ROLE, msg.sender);
        _setupRole(PAUSE_OPERATOR_ROLE, msg.sender);
        _setupRole(DAO_ROLE, msg.sender);
    }

    /// ----------------------------- API --------------------------------------

    /// @notice Allows a validator that was already staked on the polygon stake manager
    /// to join the MaticX protocol.
    /// @param _operator address of the validator.
    function addOperator(
        address _operator
    )
        external
        override
        whenNotPaused
        userHasRole(DAO_ROLE)
    {
        (uint256 operatorId, NodeOperator storage no) = getOperator(0);
        checkCondition(
            getOperatorStatus(no) == NodeOperatorStatus.INACTIVE,
            "Invalid status"
        );

        IStakeManager sm = IStakeManager(stakeManager);
        uint256 validatorId = sm.getValidatorId(_operator);

        checkCondition(validatorId != 0, "ValidatorId=0");

        IStakeManager.Validator memory poValidator = sm.validators(validatorId);

        checkCondition(
            poValidator.contractAddress != address(0),
            "Validator has no ValidatorShare"
        );

        checkCondition(
            (poValidator.status == IStakeManager.Status.Active
                ) && poValidator.deactivationEpoch == 0 ,
            "Validator isn't ACTIVE"
        );

        checkCondition(
            poValidator.signer ==
                address(uint160(uint256(keccak256(no.signerPubkey)))),
            "Invalid Signer"
        );

        no.validatorId = validatorId;

        emit AddOperator(operatorId);
    }

    /// @notice Allows to remove an operator from the system.when the operator status is
    /// set to EXIT the GOVERNANCE can call the removeOperator func to delete the operator,
    /// and the validatorProxy used to interact with the Polygon stakeManager.
    /// @param _operatorId the node operator id.
    function removeOperator(uint256 _operatorId)
        external
        override
        whenNotPaused
        userHasRole(REMOVE_OPERATOR_ROLE)
    {
        (, NodeOperator storage no) = getOperator(_operatorId);
        checkCondition(no.status == NodeOperatorStatus.EXIT, "Invalid status");

        // update the operatorIds array by removing the operator id.
        for (uint256 idx = 0; idx < operatorIds.length - 1; idx++) {
            if (_operatorId == operatorIds[idx]) {
                operatorIds[idx] = operatorIds[operatorIds.length - 1];
                break;
            }
        }
        operatorIds.pop();

        totalNodeOperators--;
        delete operatorOwners[no.rewardAddress];
        delete operators[_operatorId];

        emit RemoveOperator(_operatorId);
    }

    /// ------------------------Stake Manager API-------------------------------

    /// @notice Allows to pause the contract.
    function togglePause() external override userHasRole(PAUSE_OPERATOR_ROLE) {
        paused() ? _unpause() : _pause();
    }

    /// @notice Allows to set the MaticX contract address.
    function setMaticX(address _maticX)
        external
        override
        userHasRole(DAO_ROLE)
    {
        maticX = _maticX;
    }

    /// @notice Allows to set the contract version.
    /// @param _version contract version
    function setVersion(string memory _version)
        external
        override
        userHasRole(DEFAULT_ADMIN_ROLE)
    {
        version = _version;
    }

    /// @notice Allows to get a node operator by msg.sender.
    /// @param _owner a valid address of an operator owner, if not set msg.sender will be used.
    /// @return op returns a node operator.
    function getNodeOperator(address _owner)
        external
        view
        returns (NodeOperator memory)
    {
        uint256 operatorId = operatorOwners[_owner];
        return _getNodeOperator(operatorId);
    }

    /// @notice Allows to get a node operator by _operatorId.
    /// @param _operatorId the id of the operator.
    /// @return op returns a node operator.
    function getNodeOperator(uint256 _operatorId)
        external
        view
        returns (NodeOperator memory)
    {
        return _getNodeOperator(_operatorId);
    }

    function _getNodeOperator(uint256 _operatorId)
        private
        view
        returns (NodeOperator memory)
    {
        (, NodeOperator memory nodeOperator) = getOperator(_operatorId);
        nodeOperator.status = getOperatorStatus(nodeOperator);
        return nodeOperator;
    }

    function getOperatorStatus(NodeOperator memory _op)
        private
        view
        returns (NodeOperatorStatus res)
    {
        if (_op.status == NodeOperatorStatus.STOPPED) {
            res = NodeOperatorStatus.STOPPED;
        } else if (_op.status == NodeOperatorStatus.CLAIMED) {
            res = NodeOperatorStatus.CLAIMED;
        } else if (_op.status == NodeOperatorStatus.EXIT) {
            res = NodeOperatorStatus.EXIT;
        } else if (_op.status == NodeOperatorStatus.UNSTAKED) {
            res = NodeOperatorStatus.UNSTAKED;
        } else {
            IStakeManager.Validator memory v = IStakeManager(stakeManager)
                .validators(_op.validatorId);
            if (
                v.status == IStakeManager.Status.Active &&
                v.deactivationEpoch == 0
            ) {
                res = NodeOperatorStatus.ACTIVE;
            } else if (
                (
                    v.status == IStakeManager.Status.Active ||
                    v.status == IStakeManager.Status.Locked
                ) &&
                v.deactivationEpoch != 0
            ) {
                res = NodeOperatorStatus.EJECTED;
            } else if (
                v.status == IStakeManager.Status.Locked &&
                v.deactivationEpoch == 0
            ) {
                res = NodeOperatorStatus.JAILED;
            } else {
                res = NodeOperatorStatus.INACTIVE;
            }
        }
    }

    /// @notice Allows to get a validator share address.
    /// @param _operatorId the id of the operator.
    /// @return va returns a stake manager validator.
    function getValidatorShare(uint256 _operatorId)
        external
        view
        returns (address)
    {
        (, NodeOperator memory op) = getOperator(_operatorId);
        return op.validatorShare;
    }

    /// @notice Get the maticX contract addresses
    function getContracts()
        external
        view
        override
        returns (
            address _stakeManager,
            address _polygonERC20,
            address _maticX
        )
    {
        _stakeManager = stakeManager;
        _polygonERC20 = polygonERC20;
        _maticX = maticX;
    }

    /// @notice Get the global state
    function getState()
        external
        view
        override
        returns (
            uint256 _totalNodeOperator,
            uint256 _totalInactiveNodeOperator,
            uint256 _totalActiveNodeOperator,
            uint256 _totalStoppedNodeOperator,
            uint256 _totalUnstakedNodeOperator,
            uint256 _totalClaimedNodeOperator,
            uint256 _totalExitNodeOperator,
            uint256 _totalJailedNodeOperator,
            uint256 _totalEjectedNodeOperator
        )
    {
        uint256 operatorIdsLength = operatorIds.length;
        _totalNodeOperator = operatorIdsLength;
        for (uint256 idx = 0; idx < operatorIdsLength; idx++) {
            uint256 operatorId = operatorIds[idx];
            NodeOperator memory op = operators[operatorId];
            NodeOperatorStatus status = getOperatorStatus(op);

            if (status == NodeOperatorStatus.INACTIVE) {
                _totalInactiveNodeOperator++;
            } else if (status == NodeOperatorStatus.ACTIVE) {
                _totalActiveNodeOperator++;
            } else if (status == NodeOperatorStatus.STOPPED) {
                _totalStoppedNodeOperator++;
            } else if (status == NodeOperatorStatus.UNSTAKED) {
                _totalUnstakedNodeOperator++;
            } else if (status == NodeOperatorStatus.CLAIMED) {
                _totalClaimedNodeOperator++;
            } else if (status == NodeOperatorStatus.JAILED) {
                _totalJailedNodeOperator++;
            } else if (status == NodeOperatorStatus.EJECTED) {
                _totalEjectedNodeOperator++;
            } else {
                _totalExitNodeOperator++;
            }
        }
    }

    /// @notice Get operatorIds.
    function getOperatorIds()
        external
        view
        override
        returns (uint256[] memory)
    {
        return operatorIds;
    }

    /// @notice Returns an operatorInfo list.
    /// @param _allWithStake if true return all operators with ACTIVE, EJECTED, JAILED.
    /// @param _delegation if true return all operators that delegation is set to true.
    /// @return Returns a list of operatorInfo.
    function getOperatorInfos(
        bool _delegation,
        bool _allWithStake
    ) external view override returns (Operator.OperatorInfo[] memory) {
        Operator.OperatorInfo[]
            memory operatorInfos = new Operator.OperatorInfo[](
                totalNodeOperators
            );

        uint256 length = operatorIds.length;
        uint256 index;

        for (uint256 idx = 0; idx < length; idx++) {
            uint256 operatorId = operatorIds[idx];
            NodeOperator storage no = operators[operatorId];
            NodeOperatorStatus status = getOperatorStatus(no);

            // if operator status is not ACTIVE we continue. But, if _allWithStake is true
            // we include EJECTED and JAILED operators.
            if (
                status != NodeOperatorStatus.ACTIVE &&
                !(_allWithStake &&
                    (status == NodeOperatorStatus.EJECTED ||
                        status == NodeOperatorStatus.JAILED))
            ) continue;

            // if true we check if the operator delegation is true.
            if (_delegation) {
                if (!IValidatorShare(no.validatorShare).delegation()) continue;
            }

            operatorInfos[index] = Operator.OperatorInfo({
                operatorId: operatorId,
                validatorShare: no.validatorShare,
                maxDelegateLimit: no.maxDelegateLimit,
                rewardAddress: no.rewardAddress
            });
            index++;
        }
        if (index != totalNodeOperators) {
            Operator.OperatorInfo[]
                memory operatorInfosOut = new Operator.OperatorInfo[](index);

            for (uint256 i = 0; i < index; i++) {
                operatorInfosOut[i] = operatorInfos[i];
            }
            return operatorInfosOut;
        }
        return operatorInfos;
    }

    /// @notice Checks condition and displays the message
    /// @param _condition a condition
    /// @param _message message to display
    function checkCondition(bool _condition, string memory _message)
        private
        pure
    {
        require(_condition, _message);
    }

    /// @notice Retrieve the operator struct based on the operatorId
    /// @param _operatorId id of the operator
    /// @return NodeOperator structure
    function getOperator(uint256 _operatorId)
        private
        view
        returns (uint256, NodeOperator storage)
    {
        if (_operatorId == 0) {
            _operatorId = getOperatorId(msg.sender);
        }
        NodeOperator storage no = operators[_operatorId];
        require(no.rewardAddress != address(0), "Operator not found");
        return (_operatorId, no);
    }

    /// @notice Retrieve the operator struct based on the operator owner address
    /// @param _user address of the operator owner
    /// @return NodeOperator structure
    function getOperatorId(address _user) private view returns (uint256) {
        uint256 operatorId = operatorOwners[_user];
        checkCondition(operatorId != 0, "Operator not found");
        return operatorId;
    }

    /// -------------------------------Events-----------------------------------

    /// @notice A new node operator was added.
    /// @param operatorId node operator id.
    event AddOperator(uint256 operatorId);

    /// @notice A node operator was removed.
    /// @param operatorId node operator id.
    event RemoveOperator(uint256 operatorId);

    /// @notice A node operator was staked.
    /// @param operatorId node operator id.
    event StakeOperator(
        uint256 operatorId,
        uint256 amount,
        uint256 heimdallFees
    );

    /// @notice update operator name.
    event NewName(uint256 operatorId, string name);
}
