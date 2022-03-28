// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "./interfaces/IValidatorRegistry.sol";
import "./interfaces/IMaticX.sol";
import "./interfaces/IStakeManager.sol";

/// @title ValidatorRegistry
/// @notice ValidatorRegistry is the main contract that manage validators
/// @dev ValidatorRegistry is the main contract that manage validators.
contract ValidatorRegistry is
    IValidatorRegistry,
    PausableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    /// @notice contract version.
    string public version;
    IStakeManager private stakeManager;
    /// @notice polygonERC20 token (Matic) address.
    address private polygonERC20;
    /// @notice maticX address.
    address private maticX;

    /// @notice This stores the preferred validator id
    uint256 private preferredValidatorId;

    /// @notice This stores the validator id of the last withdraw request sent to
    uint256 private lastWithdrawnValidatorId;

    /// @notice This stores the validators.
    uint256[] private validators;

    /// @notice Mapping of registered validator ids
    mapping(uint256 => bool) private validatorIdExists;

    /// -------------------------- initialize ----------------------------------

    /// @notice Initialize the ValidatorRegistry contract.
    function initialize(
        address _stakeManager,
        address _polygonERC20,
        address _maticX,
        address _manager
    ) external initializer {
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        stakeManager = IStakeManager(_stakeManager);
        polygonERC20 = _polygonERC20;
        maticX = _maticX;

        preferredValidatorId = 0;

        _setupRole(DEFAULT_ADMIN_ROLE, _manager);
    }

    /// ----------------------------- API --------------------------------------

    /// @notice Allows a validator that was already staked on the polygon stake manager
    /// to join the MaticX protocol.
    /// @param _validatorId id of the validator.
    function addValidator(
        uint256 _validatorId
    )
        external
        override
        whenNotPaused
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(validatorIdExists[_validatorId] == false, "Validator already exists in our registry");

        IStakeManager.Validator memory smValidator = stakeManager.validators(_validatorId);

        require(
            smValidator.contractAddress != address(0),
            "Validator has no ValidatorShare"
        );

        require(
            (smValidator.status == IStakeManager.Status.Active
                ) && smValidator.deactivationEpoch == 0 ,
            "Validator isn't ACTIVE"
        );

        validators.push(_validatorId);
        validatorIdExists[_validatorId] = true;

        emit AddValidator(_validatorId);
    }

    /// @notice Allows to remove an validator from the registry.
    /// @param _validatorId the validator id.
    function removeValidator(uint256 _validatorId)
        external
        override
        whenNotPaused
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(validatorIdExists[_validatorId] == true, "Validator doesn't exist in our registry");
        require(preferredValidatorId != _validatorId, "Can't remove a preferred validator");

        address validatorShare = stakeManager.getValidatorContract(_validatorId);
        (uint256 validatorBalance, ) = IValidatorShare(validatorShare).getTotalStake(address(this));
        require(validatorBalance == 0, "Validator has some shares left"); 

        // swap with the last item and pop it.
        for (uint256 idx = 0; idx < validators.length - 1; idx++) {
            if (_validatorId == validators[idx]) {
                validators[idx] = validators[validators.length - 1];
                break;
            }
        }
        validators.pop();

        delete validatorIdExists[_validatorId];

        emit RemoveValidator(_validatorId);
    }

    /// @notice Allows to set the preffered validator id
    /// @param _validatorId the validator id.
    function setPreferredValidatorId(uint256 _validatorId)
        external
        override
        whenNotPaused
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(validatorIdExists[_validatorId] != false, "Validator doesn't exist in our registry");

        preferredValidatorId = _validatorId;
    }

    /// ------------------------Stake Manager API-------------------------------

    /// @notice Allows to pause the contract.
    function togglePause() external override onlyRole(DEFAULT_ADMIN_ROLE) {
        paused() ? _unpause() : _pause();
    }

    /// @notice Allows to set the MaticX contract address.
    function setMaticX(address _maticX)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        maticX = _maticX;
    }

    /// @notice Allows to set the contract version.
    /// @param _version contract version
    function setVersion(string memory _version)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        version = _version;
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
        _stakeManager = address(stakeManager);
        _polygonERC20 = polygonERC20;
        _maticX = maticX;
    }

    /// @notice Get validators.
    function getValidators()
        external
        view
        override
        returns (uint256[] memory)
    {
        return validators;
    }

    // @notice Get validator id by its index.
    /// @param _index validator index
    function getValidatorId(uint256 _index)
        external
        view
        override
        returns (uint256)
    {
        return validators[_index];
    }

    /// @notice Retrieve the preferred validator id
    /// @return preferredValidatorId
    function getPreferredValidatorId() external view override returns (uint256) {
        return preferredValidatorId;
    }

    /// -------------------------------Events-----------------------------------

    /// @notice A new validator was added.
    /// @param validatorId validator id.
    event AddValidator(uint256 validatorId);

    /// @notice A validator was removed.
    /// @param validatorId validator id.
    event RemoveValidator(uint256 validatorId);
}
