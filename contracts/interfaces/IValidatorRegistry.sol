// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

/// @title IValidatorRegistry
/// @notice Node validator registry interface
interface IValidatorRegistry {
    /// @notice Allows to remove a validator from the registry.
    /// @param _validatorId validator id.
    function removeValidator(uint256 _validatorId) external;

    /// @notice Allows a staked validator to join the registry.
    /// @param _validatorId validator id.
    function addValidator(uint256 _validatorId) external;

    /// @notice Allows to set the preferred validator id.
    /// @param _validatorId validator index.
    function setPrefferedValidatorId(uint256 _validatorId) external;

    /// @notice Allows to pause/unpause the validatorRegistry contract.
    function togglePause() external;

    /// @notice Allows the DAO to set maticX contract.
    function setMaticX(address _maticX) external;

    /// @notice Allows to set contract version.
    function setVersion(string memory _version) external;

    /// @notice Get the maticX contract addresses
    function getContracts()
        external
        view
        returns (
            address _stakeManager,
            address _polygonERC20,
            address _maticX
        );

    /// @notice Allows to get all the validators.
    function getValidators() external view returns (uint256[] memory);

    /// @notice Allows to get preferred validator id.
    function getPreferredValidatorId() external view returns (uint256);
}
