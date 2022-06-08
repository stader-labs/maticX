// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "./interfaces/IMaticX.sol";

contract PartnerStaking is
	Initializable,
	AccessControlUpgradeable,
	PausableUpgradeable
{
	using SafeERC20Upgradeable for IERC20Upgradeable;
	IMaticX maticXContract;

	struct Partner {
		string name;
		address walletAddress;
		string website;
		bytes metadata;
		uint256 registeredAt;
		uint256 totalMaticStaked;
		uint256 totalMaticX;
		//uint totalRewards;
	}

	enum PartnerActivityType {
		ClAIMED,
		AUTO_DISBURSED
	}

	struct PartnerActivityLog {
		uint256 timestamp;
		uint256 maticAmount;
		uint256 maticXUsed;
		PartnerActivityType activity;
	}

	enum FoundationActivityType {
		STAKED,
		UNSTAKED,
		CLAIMED
	}

	struct FoundationActivityLog {
		uint256 timestamp;
		uint256 maticAmount;
		uint256 partnerId;
		FoundationActivityType activity;
	}

	mapping(uint256 => Partner) private partners;
	mapping(address => uint256) private partnerIds;
	mapping(uint256 => PartnerActivityLog[]) partnerLog;
	FoundationActivityLog[] foundationLog;

	address private foundation;
	address private maticX;

	function initialize(address _foundation, address _maticX)
		external
		initializer
	{
		foundation = _foundation;
		maticX = _maticX;
		maticXContract = IMaticX(_maticX);
	}

	modifier onlyFoundation() {
		require(_msgSender() == foundation, "Not Authorized");
		_;
	}

	function registerPartner(
		uint256 _partnerId,
		address _partnerAddress,
		string _name,
		string _website,
		bytes _metadata
	) external onlyFoundation {
		// check partnerId in the partners mapping
		// validate partnerData
		// add into partners, partnerIds
		require(
			partners[_partnerId] == 0,
			"This partnerId is already registered with stader"
		);
		partners[_partnerId] = Partner(
			_name,
			_partnerAddress,
			website,
			_metadata,
			block.timestamp
		);
		partnerIds[_partnerAddress] = _partnerId;
	}

	function getPartnerDetails(uint256 _partnerId)
		external
		view
		onlyFoundation
		returns (Partner partner)
	{
		return partners[_partnerId];
	}

	function getAllPartnerDetails(uint256 _partnerId)
		external
		view
		onlyFoundation
		returns (Partner[] partners)
	{
		return partners;
	}

	function stake(uint256 _partnerId, uint256 _maticAmount)
		external
		onlyFoundation
	{
		// check for partnerId, amount
		// log foundation activity
		// call submit function on MaticX
		// transfer maticX to contract address
		// update the partners mapping (maticX, maticStaked)
		require(partners[_partnerId] != 0, "Invalid or Unregistered PartnerId");
		require(_maticAmount > 0, "Invalid amount");
		Partner storage partner = partners[_partnerId];
		foundationLog.push(
			FoundationActivityLog(
				block.timestamp,
				_maticAmount,
				_partnerId,
				FoundationActivityType.STAKED
			)
		);
		// approve?
		// need to check what is the value of msg.sender in this call
		uint256 _maticXAmount = maticXContract.submit(_maticAmount);
		partner[totalMaticStaked] += _maticAmount;
		partner[totalMaticX] += _maticXAmount;
	}

	function unStake(uint256 _partnerId, uint256 _maticAmount)
		external
		onlyFoundation
	{
		// check for partnerId, amount
		// log foundation activity
		// calculate equivalent maticX value
		// call unDelegate function on MaticX contract (with maticX from contract account)
		// update the partners mapping (maticX, maticStaked)
		require(partners[_partnerId] != 0, "Invalid or Unregistered PartnerId");
		Partner storage partner = partners[_partnerId];
		require(
			_maticAmount > 0 && _maticAmount <= partner.totalMaticStaked,
			"Invalid amount"
		);
		foundationLog.push(
			FoundationActivityLog(
				block.timestamp,
				_maticAmount,
				_partnerId,
				FoundationActivityType.UNSTAKED
			)
		);
		(uint256 maticXAmount, , ) = maticXContract.convertMaticToMaticX(
			_maticAmount
		);
		// approve?
		maticXContract.requestWithdraw(maticXAmount);
		partner[totalMaticStaked] -= _amount;
		partner[totalMaticX] -= maticXAmount;
	}

	function getUnstakingRequests(uint256 partnerId)
		external
		view
		onlyFoundation
	{
		// call getUserWithdrawalRequests on MaticX with contract address, and maticX
		return maticXContract.getUserWithdrawalRequests(address(this));
	}

	function withdrawUnstakedAmount(uint256 _requestIndex)
		external
		onlyFoundation
	{
		// call claimWithdrawal on MaticX
		// log foundation activity
		// transfer matic from contract address to foundation address
	}

	function claimStakingRewards() external {
		// check for msg.sender to be registered partner
		// get partner details
		// check rewards
		// check for time delay if any
		// log partner activity
		// update partner mapping
		// transfer maticX?? or claim withdrawal request on maticX?
	}

	function getPartnerDetails(address walletAddress) external view;

	function _msgSender()
		internal
		view
		virtual
		override
		returns (address sender)
	{
		if (isTrustedForwarder(msg.sender)) {
			// The assembly code is more direct than the Solidity version using `abi.decode`.
			assembly {
				sender := shr(96, calldataload(sub(calldatasize(), 20)))
			}
		} else {
			return super._msgSender();
		}
	}
}
