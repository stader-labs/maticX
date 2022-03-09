// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "../lib/Operator.sol";

/// @title INodeOperatorRegistry
/// @notice Node operator registry interface
interface INodeOperatorRegistry {
    /// @notice Allows to remove a node operator from the system.
    /// @param _operatorId node operator id.
    function removeOperator(uint256 _operatorId) external;

    /// @notice Allows a staked validator to join the system.
    /// @param _operator node operator address.
    function addOperator(address _operator) external;

    /// @notice Allows to pause/unpause the node operator contract.
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

    /// @notice Allows to get stats.
    function getState()
        external
        view
        returns (
            uint256 _totalNodeOperator,
            uint256 _totalInactiveNodeOperator,
            uint256 _totalActiveNodeOperator,
            uint256 _totalStoppedNodeOperator,
            uint256 _totalUnstakedNodeOperator,
            uint256 _totalClaimedNodeOperator,
            uint256 _totalExitNodeOperator,
            uint256 _totalSlashedNodeOperator,
            uint256 _totalEjectedNodeOperator
        );

    /// @notice Allows to get a list of operatorInfo.
    function getOperatorInfos(bool _delegation, bool _allActive)
        external
        view
        returns (Operator.OperatorInfo[] memory);


    /// @notice Allows to get all the operator ids.
    function getOperatorIds() external view returns (uint256[] memory);
}
