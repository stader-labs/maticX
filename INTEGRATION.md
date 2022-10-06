# Integration guide

## Ethereum

Liquid staking is achieved through `MaticX` contract and the yield-bearing ERC-20 token `MaticX` is given to the user.

### 1. Stake Matic

Send Matic and receive liquid staking MaticX token.
_MaticX approval should be given prior._

```SOLIDITY
IMatic matic = IMatic(MATIC_ADDRESS);
IMaticX maticX = IMaticX(MATICX_ADDRESS);
require(matic.approve(MATICX_ADDRESS, _amountInMatic), "Not approved");
uint256 amountInMaticX = maticX.submit(_amountInMatic);

emit StakeEvent(msg.sender, msg.value, amountInMaticX);
```

### 2. Unstake Matic

Send MaticX and create a withdrawal request.  
_MaticX approval should be given prior._

```SOLIDITY
IMaticX maticX = IMaticX(MATICX_ADDRESS);
require(
    maticX.approve(MATICX_ADDRESS, _amountInMaticX),
    "Not approved"
);
maticX.requestWithdraw(_amountInMaticX);

emit UnstakeEvent(msg.sender, _amountInMaticX);
```

### 3. Claim Matic

After 3-4 days (80 checkpoints), Matic can be withdrawn.

```SOLIDITY
IMatic matic = IMatic(MATIC_ADDRESS);
IMaticX maticX = IMaticX(MATICX_ADDRESS);
maticX.claimWithdrawal(_idx);
uint256 amountInMatic = matic.balanceOf(msg.sender);

emit ClaimEvent(msg.sender, amountInMatic);
```

## Full example:

```SOLIDITY
pragma solidity ^0.8.0;

import "IMatic.sol";
import "IMaticX.sol";

contract Example {
    event StakeEvent(
        address indexed _address,
        uint256 amountInMatic,
        uint256 amountInMaticX
    );
    event UnstakeEvent(address indexed _address, uint256 amountInMaticX);
    event ClaimEvent(address indexed _address, uint256 amountInMatic);

    address private MATIC_ADDRESS =
        "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0"; //mainnet address
    address private MATICX_ADDRESS =
        "0xf03A7Eb46d01d9EcAA104558C732Cf82f6B6B645"; //mainnet address

    function stake(uint256 _amountInMatic) external {
        IMatic matic = IMatic(MATIC_ADDRESS);
        IMaticX maticX = IMaticX(MATICX_ADDRESS);
        require(matic.approve(MATICX_ADDRESS, _amountInMatic), "Not approved");
        uint256 amountInMaticX = maticX.submit(_amountInMatic);

        emit StakeEvent(msg.sender, msg.value, amountInMaticX);
    }

    function unstake(uint256 _amountInMaticX) external {
        IMaticX maticX = IMaticX(MATICX_ADDRESS);
        require(
            maticX.approve(MATICX_ADDRESS, _amountInMaticX),
            "Not approved"
        );
        maticX.requestWithdraw(_amountInMaticX);

        emit UnstakeEvent(msg.sender, _amountInMaticX);
    }

    function claim(uint256 _idx) external {
        IMatic matic = IMatic(MATIC_ADDRESS);
        IMaticX maticX = IMaticX(MATICX_ADDRESS);
        maticX.claimWithdrawal(_idx);
        uint256 amountInMatic = matic.balanceOf(msg.sender);

        emit ClaimEvent(msg.sender, amountInMatic);
    }
}
```
