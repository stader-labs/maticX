// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

interface IStakeManager {
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

	function migrateDelegation(
		uint256 _fromValidatorId,
		uint256 _toValidatorId,
		uint256 _amount
	) external;

	function setCurrentEpoch(uint256 _currentEpoch) external;

	function getValidatorContract(
		uint256 _validatorId
	) external view returns (address);

	function validators(
		uint256 _index
	) external view returns (Validator memory);

	function epoch() external view returns (uint256);

	function withdrawalDelay() external view returns (uint256);
}
