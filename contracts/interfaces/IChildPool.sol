// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

interface IChildPool {
	function version() external view returns (string memory);

	function treasury() external view returns (address payable);

	function instantPoolOwner() external view returns (address payable);

	function instantPoolMatic() external view returns (uint256);

	function instantPoolMaticX() external view returns (uint256);

	function instantWithdrawalFees() external view returns (uint256);

	function instantWithdrawalFeeBps() external view returns (uint256);

	function provideInstantPoolMatic() external payable;

	function provideInstantPoolMaticX(uint256 _amount) external;

	function withdrawInstantPoolMaticX(uint256 _amount) external;

	function withdrawInstantPoolMatic(uint256 _amount) external;

	function withdrawInstantWithdrawalFees(uint256 _amount) external;

	function swapMaticForMaticXViaInstantPool() external payable;

	function swapMaticXForMaticViaInstantPool(uint256 _amount) external;

	function setTreasury(address payable _address) external;

	function setInstantPoolOwner(address payable _address) external;

	function setFxStateChildTunnel(address _address) external;

	function setInstantWithdrawalFeeBps(uint256 _feeBps) external;

	function setTrustedForwarder(address _address) external;

	function setVersion(string calldata _version) external;

	function togglePause() external;

	function getAmountAfterInstantWithdrawalFees(uint256 _amount)
		external
		view
		returns (uint256, uint256);

	function getContracts()
		external
		view
		returns (
			address _fxStateChildTunnel,
			address _maticX,
			address _trustedForwarder
		);

	event SetTreasury(address _address);
	event SetInstantPoolOwner(address _address);
	event SetFxStateChildTunnel(address _address);
	event SetTrustedForwarder(address _address);
	event SetVersion(string _version);
	event CollectedInstantWithdrawalFees(uint256 _fees);
	event SetInstantWithdrawalFeeBps(uint256 _feeBps);
}
