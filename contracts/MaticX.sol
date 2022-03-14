// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import "./interfaces/IValidatorShare.sol";
import "./interfaces/IValidatorRegistry.sol";
import "./interfaces/IStakeManager.sol";
import "./interfaces/IMaticX.sol";

contract MaticX is
    IMaticX,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable
{
    event SubmitEvent(address indexed _from, uint256 indexed _amount);
    event DelegateEvent(
        uint256 indexed _amountDelegated
    );

    using SafeERC20Upgradeable for IERC20Upgradeable;

    IValidatorRegistry public override validatorRegistry;
    IStakeManager public stakeManager;
    FeeDistribution public override entityFees;

    string public override version;
    // address to accrue revenue
    address public treasury;
    // address to cover for funds insurance.
    address public override insurance;
    address public override token;
    address public proposed_manager;
    address public manager;
    uint256 public override totalBuffered;
    uint256 public override rewardDistributionLowerBound;
    uint256 public override reservedFunds;

    bytes32 public constant MANAGER = keccak256("MANAGER");

    /**
     * @param _validatorRegistry - Address of the validator registry
     * @param _stakeManager - Address of the stake manager
     * @param _token - Address of matic token on Ethereum Mainnet
     * @param _treasury - Address of the treasury
     * @param _insurance - Address of the insurance
     */
    function initialize(
        address _validatorRegistry,
        address _stakeManager,
        address _token,
        address _manager,
        address _treasury,
        address _insurance
    ) external override initializer {
        __AccessControl_init();
        __Pausable_init();
        __ERC20_init("Liquid Staking Matic", "maticX");

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MANAGER, _manager);
        manager = _manager;
        proposed_manager = address(0);

        validatorRegistry = IValidatorRegistry(_validatorRegistry);
        stakeManager = IStakeManager(_stakeManager);
        treasury = _treasury;
        token = _token;
        insurance = _insurance;

        entityFees = FeeDistribution(80, 20);
    }

    /**
     * @dev Send funds to MaticX contract and mints MaticX to msg.sender
     * @notice Requires that msg.sender has approved _amount of MATIC to this contract
     * @param _amount - Amount of MATIC sent from msg.sender to this contract
     * @return Amount of MaticX shares generated
     */
    function submit(uint256 _amount)
        external
        override
        whenNotPaused
        returns (uint256)
    {
        require(_amount > 0, "Invalid amount");
        IERC20Upgradeable(token).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );

        (
            uint256 amountToMint,
            uint256 totalShares,
            uint256 totalPooledMatic
        ) = convertMaticToMaticX(_amount);

        _mint(msg.sender, amountToMint);

        emit SubmitEvent(msg.sender, _amount);

        uint256 preferredValidatorId = validatorRegistry.getPreferredValidatorId();
        address validatorShare = stakeManager.getValidatorContract(preferredValidatorId);
        buyVoucher(
            validatorShare,
            _amount,
            0
        );

        emit DelegateEvent(_amount);

        return amountToMint;
    }

    /**
     * @dev Flips the pause state
     */
    function togglePause() external override onlyRole(DEFAULT_ADMIN_ROLE) {
        paused() ? _unpause() : _pause();
    }

    ////////////////////////////////////////////////////////////
    /////                                                    ///
    /////             ***ValidatorShare API***               ///
    /////                                                    ///
    ////////////////////////////////////////////////////////////

    /**
     * @dev API for delegated buying vouchers from validatorShare
     * @param _validatorShare - Address of validatorShare contract
     * @param _amount - Amount of MATIC to use for buying vouchers
     * @param _minSharesToMint - Minimum of shares that is bought with _amount of MATIC
     * @return Actual amount of MATIC used to buy voucher, might differ from _amount because of _minSharesToMint
     */
    function buyVoucher(
        address _validatorShare,
        uint256 _amount,
        uint256 _minSharesToMint
    ) private returns (uint256) {
        uint256 amountSpent = IValidatorShare(_validatorShare).buyVoucher(
            _amount,
            _minSharesToMint
        );

        return amountSpent;
    }

    /**
     * @dev API for getting total stake of this contract from validatorShare
     * @param _validatorShare - Address of validatorShare contract
     * @return Total stake of this contract and MATIC -> share exchange rate
     */
    function getTotalStake(IValidatorShare _validatorShare)
        public
        view
        override
        returns (uint256, uint256)
    {
        return _validatorShare.getTotalStake(address(this));
    }

    ////////////////////////////////////////////////////////////
    /////                                                    ///
    /////            ***Helpers & Utilities***               ///
    /////                                                    ///
    ////////////////////////////////////////////////////////////

    /**
     * @dev Helper function for that returns total pooled MATIC
     * @return Total pooled MATIC
     */
    function getTotalStakeAcrossAllValidators()
        public
        view
        override
        returns (uint256)
    {
        uint256 totalStake;
        uint256[] memory validators = validatorRegistry.getValidators();
        for (uint256 i = 0; i < validators.length; i++) {
            address validatorShare = stakeManager.getValidatorContract(validators[i]);
            (uint256 currValidatorShare, ) = getTotalStake(
                IValidatorShare(validatorShare)
            );

            totalStake += currValidatorShare;
        }

        return totalStake;
    }

    /**
     * @dev Function that calculates total pooled Matic
     * @return Total pooled Matic
     */
    function getTotalPooledMatic() public view override returns (uint256) {
        uint256 totalStaked = getTotalStakeAcrossAllValidators();
        return totalStaked + totalBuffered - reservedFunds;
    }

    /**
     * @dev Function that converts arbitrary maticX to Matic
     * @param _balance - Balance in maticX
     * @return Balance in Matic, totalShares and totalPooledMATIC
     */
    function convertMaticXToMatic(uint256 _balance)
        public
        view
        override
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        // TODO - GM. Where is this totalSupply function?
        uint256 totalShares = totalSupply();
        totalShares = totalShares == 0 ? 1 : totalShares;

        uint256 totalPooledMATIC = getTotalPooledMatic();
        totalPooledMATIC = totalPooledMATIC == 0 ? 1 : totalPooledMATIC;

        uint256 balanceInMATIC = (_balance * totalPooledMATIC) / totalShares;

        return (balanceInMATIC, totalShares, totalPooledMATIC);
    }

    /**
     * @dev Function that converts arbitrary Matic to maticX
     * @param _balance - Balance in Matic
     * @return Balance in maticX, totalShares and totalPooledMATIC
     */
    function convertMaticToMaticX(uint256 _balance)
        public
        view
        override
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 totalShares = totalSupply();
        totalShares = totalShares == 0 ? 1 : totalShares;

        uint256 totalPooledMatic = getTotalPooledMatic();
        totalPooledMatic = totalPooledMatic == 0 ? 1 : totalPooledMatic;

        uint256 balanceInMaticX = (_balance * totalShares) / totalPooledMatic;

        return (balanceInMaticX, totalShares, totalPooledMatic);
    }

    ////////////////////////////////////////////////////////////
    /////                                                    ///
    /////                 ***Setters***                      ///
    /////                                                    ///
    ////////////////////////////////////////////////////////////

    /**
     * @dev Function that sets entity fees
     * @notice Callable only by manager
     * @param _treasuryFee - Treasury fee in %
     * @param _insuranceFee - Insurance fee in %
     */
    function setFees(
        uint8 _treasuryFee,
        uint8 _insuranceFee
    ) external override onlyRole(MANAGER) {
        require(
            _treasuryFee + _insuranceFee == 100,
            "sum(fee) is not equal to 100"
        );
        entityFees.treasury = _treasuryFee;
        entityFees.insurance = _insuranceFee;
    }

    /**
     * @dev Function that sets new manager address
     * @notice Callable only by manager
     * @param _address - New manager address
     */
    function setTreasuryAddress(address _address) external onlyRole(MANAGER) {
        treasury = _address;
    }

    /**
     * @dev Function that sets new insurance address
     * @notice Callable only by manager
     * @param _address - New insurance address
     */
    function setInsuranceAddress(address _address)
        external
        override
        onlyRole(MANAGER)
    {
        insurance = _address;
    }

    /**
     * @dev Function that sets new insurance address
     * @notice Callable only by manager
     * @param _address - New manager address
     */
    function proposeManagerAddress(address _address) external onlyRole(MANAGER) {
        proposed_manager = _address;
    }

    function acceptProposedManagerAddress() external {
        // TODO - GM. Is this address validation sufficient?
        require(proposed_manager != address(0) && msg.sender == proposed_manager,
            "You are not the proposed manager");
        _revokeRole(MANAGER, manager);
        _setupRole(MANAGER, proposed_manager);
        manager = proposed_manager;
        proposed_manager = address(0);
    }

    /**
     * @dev Function that sets new node operator address
     * @notice Only callable by manager
     * @param _address - New node operator address
     */
    function setValidatorRegistryAddress(address _address)
        external
        override
        onlyRole(MANAGER)
    {
        validatorRegistry = IValidatorRegistry(_address);
    }

    /**
     * @dev Function that sets new lower bound for rewards distribution
     * @notice Only callable by manager
     * @param _rewardDistributionLowerBound - New lower bound for rewards distribution
     */
    function setRewardDistributionLowerBound(
        uint256 _rewardDistributionLowerBound
    ) external override onlyRole(MANAGER) {
        rewardDistributionLowerBound = _rewardDistributionLowerBound;
    }

    /**
     * @dev Function that sets the new version
     * @param _version - New version that will be set
     */
    function setVersion(string calldata _version)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        version = _version;
    }
}
