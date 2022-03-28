// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "./IValidatorShare.sol";
import "./IValidatorRegistry.sol";

/// @title MaticX interface.
interface IMaticX is IERC20Upgradeable {
    struct WithdrawalRequest {
        uint256 validatorNonce;
        uint256 requestEpoch;
        address validatorAddress;
    }

    struct FeeDistribution {
        uint8 treasury;
        uint8 insurance;
    }

    function validatorRegistry() external returns (IValidatorRegistry);

    function entityFees()
        external
        returns (
            uint8,
            uint8
        );

    function version() external view returns (string memory);

    function insurance() external view returns (address);

    function token() external view returns (address);

    function initialize(
        address _validatorRegistry,
        address _stakeManager,
        address _token,
        address _manager,
        address _treasury,
        address _insurance
    ) external;

    function submit(uint256 _amount) external returns (uint256);

    function requestWithdraw(uint256 _amount) external;

    function claimWithdrawal() external;

    function restake() external;

    function togglePause() external;

    function getTotalStake(IValidatorShare _validatorShare)
        external
        view
        returns (uint256, uint256);

    function getTotalStakeAcrossAllValidators() external view returns (uint256);

    function getTotalPooledMatic() external view returns (uint256);

    function convertMaticXToMatic(uint256 _balance)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        );

    function convertMaticToMaticX(uint256 _balance)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        );

    function setFees(
        uint8 _treasuryFee,
        uint8 _insuranceFee
    ) external;

    function setInsuranceAddress(address _address) external;

    function setValidatorRegistryAddress(address _address) external;

    function setVersion(string calldata _version) external;
}
