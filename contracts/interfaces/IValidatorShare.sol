// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IValidatorShare is IERC20Upgradeable {
	struct DelegatorUnbond {
		uint256 shares;
		uint256 withdrawEpoch;
	}

	function buyVoucher(
		uint256 _amount,
		uint256 _minSharesToMint
	) external returns (uint256 amountToDeposit);

	function buyVoucherPOL(
		uint256 _amount,
		uint256 _minSharesToMint
	) external returns (uint256 amountToDeposit);

	function sellVoucher_newPOL(
		uint256 _claimAmount,
		uint256 _maximumSharesToBurn
	) external;

	function unstakeClaimTokens_newPOL(uint256 _unbondNonce) external;

	function withdrawRewardsPOL() external;

	function getTotalStake(
		address _user
	) external view returns (uint256, uint256);

	function unbondNonces(address _user) external view returns (uint256);

	function unbonds_new(
		address _user,
		uint256 _unbondNonce
	) external view returns (DelegatorUnbond memory);

	function stakingLogger() external view returns (address);
}
