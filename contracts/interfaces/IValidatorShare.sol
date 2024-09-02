// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

interface IValidatorShare {
	struct DelegatorUnbond {
		uint256 shares;
		uint256 withdrawEpoch;
	}

	function minAmount() external view returns (uint256);

	function unbondNonces(address _address) external view returns (uint256);

	function validatorId() external view returns (uint256);

	function delegation() external view returns (bool);

	function buyVoucher(uint256 _amount, uint256 _minSharesToMint)
		external
		returns (uint256);

	function buyVoucherPOL(uint256 _amount, uint256 _minSharesToMint)
		external
		returns (uint256);

	function sellVoucher_new(uint256 _claimAmount, uint256 _maximumSharesToBurn)
		external;

	function sellVoucher_newPOL(uint256 _claimAmount, uint256 _maximumSharesToBurn)
		external;

	function unstakeClaimTokens_new(uint256 _unbondNonce) external;

	function restake() external returns (uint256, uint256);

	function withdrawRewards() external;

	function getTotalStake(address _user)
		external
		view
		returns (uint256, uint256);

	function unbonds_new(address _address, uint256 _unbondNonce)
		external
		view
		returns (DelegatorUnbond memory);
}
