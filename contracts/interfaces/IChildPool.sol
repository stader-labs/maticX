// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

interface IChildPool {
	function version() external view returns (string memory);

	function instantPoolOwner() external view returns (address);

	function instantPoolMatic() external view returns (uint256);

	function instantPoolMaticX() external view returns (uint256);

	function instantWithdrawalFees() external view returns (uint256);

	function instantWithdrawalFeePercent() external view returns (uint8);

	function provideInstantPoolMatic(uint256 _amount) external;

	function provideInstantPoolMaticX(uint256 _amount) external;

	function withdrawInstantPoolMaticX(uint256 _amount) external;

	function withdrawInstantPoolMatic(uint256 _amount) external;

	function withdrawInstantWithdrawalFees(uint256 _amount) external;

	function swapMaticForMaticXViaInstantPool(uint256 _amount) external;

	function swapMaticXForMaticViaInstantPool(uint256 _amount) external;

	function setInstantPoolOwner(address _address) external;

	function setFxStateChildTunnel(address _address) external;

	function setInstantWithdrawalFeePercent(uint8 _feePercent) external;

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
			address _polygonERC20,
			address _maticX,
			address _trustedForwarder
		);

	event SetInstantPoolOwner(address _address);
	event SetFxStateChildTunnel(address _address);
	event SetTrustedForwarder(address _address);
	event SetVersion(string _version);
	event CollectedInstantWithdrawalFees(uint256 _fees);
	event SetInstantWithdrawalFeePercent(uint8 _feePercent);
}
