// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.8;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import { ERC20PermitUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import { IChildToken } from "../interfaces/IChildToken.sol";

contract UChildERC20 is
	ContextUpgradeable,
	AccessControlUpgradeable,
	ERC20Upgradeable,
	ERC20PermitUpgradeable,
	IChildToken
{
	bytes32 public constant DEPOSITOR_ROLE = keccak256("DEPOSITOR_ROLE");

	/// @dev The constructor is disabled for a proxy upgrade.
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		_disableInitializers();
	}

	/// @notice Initialize the contract after it has been proxified
	/// @dev meant to be called once immediately after deployment
	function initialize(
		string calldata name_,
		string calldata symbol_,
		address childChainManager
	) external initializer {
		ContextUpgradeable.__Context_init();
		AccessControlUpgradeable.__AccessControl_init();
		ERC20Upgradeable.__ERC20_init(name_, symbol_);
		ERC20PermitUpgradeable.__ERC20Permit_init(name_);

		_grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
		_grantRole(DEPOSITOR_ROLE, childChainManager);
	}

	/// @notice called when token is deposited on root chain
	/// @dev Should be callable only by ChildChainManager
	/// Should handle deposit by minting the required amount for user
	/// Make sure minting is done only by this function
	/// @param user user address for whom deposit is being done
	/// @param depositData abi encoded amount
	function deposit(
		address user,
		bytes calldata depositData
	) external override onlyRole(DEPOSITOR_ROLE) {
		uint256 amount = abi.decode(depositData, (uint256));
		_mint(user, amount);
	}

	/// @notice called when user wants to withdraw tokens back to root chain
	/// @dev Should burn user's tokens. This transaction will be verified when exiting on root chain
	/// @param amount amount of tokens to withdraw
	function withdraw(uint256 amount) external override {
		_burn(_msgSender(), amount);
	}
}
