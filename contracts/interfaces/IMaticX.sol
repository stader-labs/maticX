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

	function entityFees() external returns (uint8, uint8);

	function version() external view returns (string memory);

	function insurance() external view returns (address);

	function token() external view returns (address);

	function feePercent() external view returns (uint8);

	function drainedAmount() external view returns (uint256);

	function initialize(
		address _validatorRegistry,
		address _stakeManager,
		address _token,
		address _manager,
		address _instant_pool_manager,
		address _treasury,
		address _insurance
	) external;

	function provideInstantPoolMatic(uint256 _amount) external;

	function provideInstantPoolMaticX(uint256 _amount) external;

	function withdrawInstantPoolMaticX(uint256 _amount) external;

	function withdrawInstantPoolMatic(uint256 _amount) external;

	function mintMaticXToInstantPool() external;

	function swapMaticForMaticXViaInstantPool(uint256 _amount) external;

	function submit(uint256 _amount) external returns (uint256);

	function requestWithdraw(uint256 _amount) external;

	function claimWithdrawal(uint256 _idx) external;

	function restake(uint256 _validatorId) external;

	function restakeAll() external;

	function drain(uint256 _validatorId) external;

	function migrateDrainedTokens(uint256 _idx, uint256 _validatorId) external;

	function togglePause() external;

	function getUserWithdrawalRequests(address _address)
		external
		view
		returns (WithdrawalRequest[] memory);

	function getSharesAmountOfUserWithdrawalRequest(
		address _address,
		uint256 _idx
	) external view returns (uint256);

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

	function setFees(uint8 _treasuryFee, uint8 _insuranceFee) external;

	function setFeePercent(uint8 _feePercent) external;

	function setInsuranceAddress(address _address) external;

	function setValidatorRegistryAddress(address _address) external;

	function setVersion(string calldata _version) external;

	event Submit(address indexed _from, uint256 _amount);
	event Delegate(uint256 indexed _validatorId, uint256 _amountDelegated);
	event RequestWithdraw(
		address indexed _from,
		uint256 _amountMaticX,
		uint256 _amountMatic
	);
	event ClaimWithdrawal(
		address indexed _from,
		uint256 indexed _idx,
		uint256 _amountClaimed
	);
	event Restake(
		address indexed _from,
		uint256 indexed _validatorId,
		uint256 _amountRestaked
	);
	event DistributeRewards(
		address indexed _from,
		uint256 _treasuryRewards,
		uint256 _insuranceRewards
	);
	event Drain(
		address indexed _from,
		uint256 indexed _validatorId,
		uint256 _amount
	);
}
