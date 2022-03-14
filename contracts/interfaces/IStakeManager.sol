// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

/// @title polygon stake manager interface.
/// @notice User to interact with the polygon stake manager.
interface IStakeManager {
    /// @notice Restake Matics for a validator on polygon stake manager.
    /// @param validatorId validator id.
    /// @param amount amount to stake.
    /// @param stakeRewards restake rewards.
    function restake(
        uint256 validatorId,
        uint256 amount,
        bool stakeRewards
    ) external;

    /// @notice Request unstake a validator.
    /// @param validatorId validator id.
    function unstake(uint256 validatorId) external;

    /// @notice Get the validator id using the user address.
    /// @param user user that own the validator in our case the validator contract.
    /// @return return the validator id
    function getValidatorId(address user) external view returns (uint256);

    /// @notice get the validator contract used for delegation.
    /// @param validatorId validator id.
    /// @return return the address of the validator contract.
    function getValidatorContract(uint256 validatorId)
        external
        view
        returns (address);

    /// @notice Withdraw accumulated rewards
    /// @param validatorId validator id.
    function withdrawRewards(uint256 validatorId) external;

    /// @notice Get validator total staked.
    /// @param validatorId validator id.
    function validatorStake(uint256 validatorId)
        external
        view
        returns (uint256);

    /// @notice Allows to unstake the staked tokens on the stakeManager.
    /// @param validatorId validator id.
    function unstakeClaim(uint256 validatorId) external;

    /// @notice Returns a withdrawal delay.
    function withdrawalDelay() external view returns (uint256);

    /// @notice Transfers amount from delegator
    function delegationDeposit(
        uint256 validatorId,
        uint256 amount,
        address delegator
    ) external returns (bool);

    function epoch() external view returns (uint256);

    enum Status {
        Inactive,
        Active,
        Locked,
        Unstaked
    }

    struct Validator {
        uint256 amount;
        uint256 reward;
        uint256 activationEpoch;
        uint256 deactivationEpoch;
        uint256 jailTime;
        address signer;
        address contractAddress;
        Status status;
        uint256 commissionRate;
        uint256 lastCommissionUpdate;
        uint256 delegatorsReward;
        uint256 delegatedAmount;
        uint256 initialRewardPerStake;
    }

    function validators(uint256 _index)
        external
        view
        returns (Validator memory);

    /// @notice Returns the address of the nft contract
    function NFTContract() external view returns (address);

    /// @notice Returns the validator accumulated rewards on stake manager.
    function validatorReward(uint256 validatorId)
        external
        view
        returns (uint256);
}
