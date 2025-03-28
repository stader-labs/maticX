// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ValidatorShareMock {
	struct DelegatorUnbond {
		uint256 shares;
		uint256 withdrawEpoch;
	}

	uint256 constant REWARD_PRECISION = 10 ** 25;

	address public token;

	bool public delegation;
	uint256 mAmount;
	uint256 public rewardPerShare;

	uint256 public totalShares;
	uint256 public withdrawPool;
	uint256 public totalStaked;
	uint256 public totalWithdrawPoolShares;
	uint256 public validatorId;

	mapping(address => mapping(uint256 => uint256))
		public user2WithdrawPoolShare;
	mapping(address => uint256) public unbondNonces;
	mapping(address => uint256) public initalRewardPerShare;

	address stakeManager;
	address public stakingLogger;

	constructor(address _token, address _stakeManager, uint256 _id) {
		token = _token;
		stakeManager = _stakeManager;
		validatorId = _id;
		delegation = true;
	}

	function buyVoucher(uint256 _amount, uint256) external returns (uint256) {
		return _buyVoucher(_amount);
	}

	function buyVoucherPOL(
		uint256 _amount,
		uint256
	) external returns (uint256) {
		return _buyVoucher(_amount);
	}

	function sellVoucher_new(uint256 _claimAmount, uint256) external {
		_sellVoucher_new(_claimAmount);
	}

	function sellVoucher_newPOL(uint256 _claimAmount, uint256) external {
		_sellVoucher_new(_claimAmount);
	}

	function unstakeClaimTokens_new(uint256 _unbondNonce) external {
		_unstakeClaimTokens_new(_unbondNonce);
	}

	function unstakeClaimTokens_newPOL(uint256 _unbondNonce) external {
		_unstakeClaimTokens_new(_unbondNonce);
	}

	function restake() external returns (uint256, uint256) {
		uint256 liquidRewards = _withdrawReward(msg.sender);
		// uint256 amountRestaked = buyVoucher(liquidRewards, 0);
		uint256 amountRestaked = 0;

		return (amountRestaked, liquidRewards - amountRestaked);
	}

	function calculateRewards() private view returns (uint256) {
		uint256 thisBalance = IERC20(token).balanceOf(address(this));
		return thisBalance - (totalStaked + withdrawPool);
	}

	function withdrawRewards() external {
		_withdrawReward(msg.sender);
	}

	function withdrawRewardsPOL() external {
		_withdrawReward(msg.sender);
	}

	function getTotalStake(address) external view returns (uint256, uint256) {
		//getTotalStake returns totalStake of msg.sender but we need withdrawPool
		return (totalStaked, 1);
	}

	function setMinAmount(uint256 _minAmount) public {
		mAmount = _minAmount;
	}

	function minAmount() public view returns (uint256) {
		return mAmount;
	}

	function _withdrawReward(address _user) private returns (uint256) {
		uint256 reward = calculateRewards();
		require(reward >= minAmount(), "Reward < minAmount");
		IERC20(token).transfer(_user, reward);

		return reward;
	}

	function unbonds_new(
		address _address,
		uint256 _unbondNonce
	) external view returns (DelegatorUnbond memory) {
		DelegatorUnbond memory unbond = DelegatorUnbond(
			user2WithdrawPoolShare[_address][_unbondNonce],
			2
		);
		return unbond;
	}

	function _buyVoucher(uint256 _amount) private returns (uint256) {
		uint256 totalAmount = IERC20(token).balanceOf(address(this));

		uint256 shares = totalAmount != 0
			? (_amount * totalShares) / totalAmount
			: _amount;

		totalShares += shares;
		totalStaked += _amount;

		return 1;
	}

	function _sellVoucher_new(uint256 _claimAmount) private {
		uint256 unbondNonce = unbondNonces[msg.sender] + 1;

		withdrawPool += _claimAmount;
		totalWithdrawPoolShares += _claimAmount;
		totalStaked -= _claimAmount;

		unbondNonces[msg.sender] = unbondNonce;
		user2WithdrawPoolShare[msg.sender][unbondNonce] = _claimAmount;
	}

	function _unstakeClaimTokens_new(uint256 _unbondNonce) private {
		uint256 withdrawPoolShare = user2WithdrawPoolShare[msg.sender][
			_unbondNonce
		];
		uint256 amount2Transfer = (withdrawPoolShare * withdrawPool) /
			totalWithdrawPoolShares;

		withdrawPool -= amount2Transfer;
		totalShares -= withdrawPoolShare;
		totalWithdrawPoolShares -= withdrawPoolShare;
		IERC20(token).transfer(msg.sender, amount2Transfer);
	}
}
