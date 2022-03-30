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
    event SubmitEvent(address indexed _from, uint256 _amount);
    event DelegateEvent(
        uint256 _amountDelegated
    );
    event RequestWithdrawEvent(address indexed _from, uint256 _amount);
    event ClaimWithdrawalEvent(
        address indexed _from,
        uint256 _amountClaimed
    );
    event RestakeEvent(address indexed _from, uint256 _validatorId, uint256 amountRestaked, uint256 liquidReward);

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

    /// @notice Mapping of all user ids with withdraw requests.
    mapping(address => WithdrawalRequest[]) private userWithdrawalRequests;

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
        __ERC20_init("Liquid Staking Matic Test", "tMaticX");

        _setupRole(DEFAULT_ADMIN_ROLE, _manager);
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

        (uint256 amountToMint,,) = convertMaticToMaticX(_amount);

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

    function safeApprove() external {
        IERC20Upgradeable(token).safeApprove(
            address(stakeManager),
            type(uint256).max
        );
    }

    /**
     * @dev Stores users request to withdraw into WithdrawalRequest struct
     * @param _amount - Amount of maticX that is requested to withdraw
     */
    function requestWithdraw(uint256 _amount)
        external
        override
        whenNotPaused
    {
        require(_amount > 0, "Invalid amount");

        (uint256 totalAmount2WithdrawInMatic,,) = convertMaticXToMatic(_amount);

        uint256 leftAmount2WithdrawInMatic = totalAmount2WithdrawInMatic;
        uint256 totalDelegated = getTotalStakeAcrossAllValidators();

        require(totalDelegated >= totalAmount2WithdrawInMatic, "Too much to withdraw");
        
        uint256[] memory validators = validatorRegistry.getValidators();
        for (uint256 idx = 0; idx < validators.length; idx++) {
            uint256 validatorId = validators[idx];

            address validatorShare = stakeManager.getValidatorContract(validatorId);
            (uint256 validatorBalance, ) = IValidatorShare(validatorShare).getTotalStake(address(this));

            uint256 amount2WithdrawFromValidator = (validatorBalance <=
                        leftAmount2WithdrawInMatic)
                        ? validatorBalance
                        : leftAmount2WithdrawInMatic;
            
            sellVoucher_new(
                validatorShare,
                amount2WithdrawFromValidator,
                type(uint256).max
            );

            userWithdrawalRequests[msg.sender].push(WithdrawalRequest(
                    IValidatorShare(validatorShare).unbondNonces(address(this)),
                    stakeManager.epoch() + stakeManager.withdrawalDelay(),
                    validatorShare
                )
            );
            
            leftAmount2WithdrawInMatic -= amount2WithdrawFromValidator;
            if (leftAmount2WithdrawInMatic == 0) break;
        }

        _burn(msg.sender, _amount);

        emit RequestWithdrawEvent(msg.sender, _amount);
    }

    /**
     * @dev Claims tokens from validator share and sends them to the
     * user if his request is in the userWithdrawalRequests
     */
    function claimWithdrawal(uint256 _idx) external override whenNotPaused {
        uint256 amountToClaim = 0;
        uint256 balanceBeforeClaim = IERC20Upgradeable(token).balanceOf(address(this));
        WithdrawalRequest[] storage userRequests = userWithdrawalRequests[msg.sender];
        require(stakeManager.epoch() >= userRequests[_idx].requestEpoch, "Not able to claim yet"); 
        
        unstakeClaimTokens_new(
            userRequests[_idx].validatorAddress,
            userRequests[_idx].validatorNonce
        );

        // swap with the last item and pop it.
        userRequests[_idx] = userRequests[userRequests.length - 1];
        userRequests.pop();

        amountToClaim = IERC20Upgradeable(token).balanceOf(address(this)) - balanceBeforeClaim;
        
        IERC20Upgradeable(token).safeTransfer(msg.sender, amountToClaim);

        emit ClaimWithdrawalEvent(msg.sender, amountToClaim);
    }

    /**
     * @dev Restakes all validator rewards 
     */
    function restakeAll() external override whenNotPaused {
        uint256[] memory validators = validatorRegistry.getValidators();
        for (uint256 idx = 0; idx < validators.length; idx++) {
            uint256 validatorId = validators[idx];

            restake(validatorId);
        }
    }

    /**
     * @dev Restakes all validator rewards 
     */
    function restake(uint256 _validatorId) public override whenNotPaused {
        address validatorShare = stakeManager.getValidatorContract(_validatorId);
        (uint256 amountRestaked, uint256 liquidReward) = restake(validatorShare);
        emit RestakeEvent(msg.sender, _validatorId, amountRestaked, liquidReward);
    }

    /**
     * @dev Retrieves all withdrawal requests initiated by the given address
     * @param _address - Address of an user
     * @return userWithdrawalRequests array of user withdrawal requests
     */
    function getUserWithdrawalRequests(address _address) 
        external 
        override 
        view 
        returns (WithdrawalRequest[] memory) 
    {
        return userWithdrawalRequests[_address];
    }

    /**
     * @dev Retrieves MATIC amount of a given withdrawal request
     * @param _address - Address of an user
     * @return _idx index of the withdrawal request
     */
    function getMaticAmountOfUserWithdrawalRequest(address _address, uint256 _idx) 
        external 
        override
        view 
        returns (uint256) 
    {
        WithdrawalRequest memory userRequest = userWithdrawalRequests[_address][_idx];
        IValidatorShare validatorShare = IValidatorShare(userRequest.validatorAddress);
        IValidatorShare.DelegatorUnbond memory unbond = validatorShare.unbonds_new(address(this), userRequest.validatorNonce);

        return unbond.shares;
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
     * @dev API for delegated selling vouchers from validatorShare
     * @param _validatorShare - Address of validatorShare contract
     * @param _claimAmount - Amount of MATIC to claim
     * @param _maximumSharesToBurn - Maximum amount of shares to burn
     */
    function sellVoucher_new(
        address _validatorShare,
        uint256 _claimAmount,
        uint256 _maximumSharesToBurn
    ) private {
        IValidatorShare(_validatorShare).sellVoucher_new(
            _claimAmount,
            _maximumSharesToBurn
        );
    }

    /**
     * @dev API for delegated unstaking and claiming tokens from validatorShare
     * @param _validatorShare - Address of validatorShare contract
     * @param _unbondNonce - Unbond nonce
     */
    function unstakeClaimTokens_new(
        address _validatorShare,
        uint256 _unbondNonce
    ) private {
        IValidatorShare(_validatorShare).unstakeClaimTokens_new(_unbondNonce);
    }

    /**
     * @dev API for delegated restaking rewards to validatorShare
     * @param _validatorShare - Address of validatorShare contract
     */
    function restake(address _validatorShare) private returns (uint256, uint256) {
        return IValidatorShare(_validatorShare).restake();
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
        return totalStaked;
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
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
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
    function setTreasuryAddress(address _address) external onlyRole(DEFAULT_ADMIN_ROLE) {
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
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        insurance = _address;
    }

    /**
     * @dev Function that appoints a new manager address
     * @notice Callable only by manager
     * @param _address - New manager address
     */
    function proposeManagerAddress(address _address) external onlyRole(DEFAULT_ADMIN_ROLE) {
        proposed_manager = _address;
    }

    function acceptProposedManagerAddress() external {
        require(proposed_manager != address(0) && msg.sender == proposed_manager,
            "You are not the proposed manager");
        _revokeRole(DEFAULT_ADMIN_ROLE, manager);
        _setupRole(DEFAULT_ADMIN_ROLE, proposed_manager);
        manager = proposed_manager;
        proposed_manager = address(0);
    }

    /**
     * @dev Function that sets new validator registry address
     * @notice Only callable by manager
     * @param _address - New validator registry address
     */
    function setValidatorRegistryAddress(address _address)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        validatorRegistry = IValidatorRegistry(_address);
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
