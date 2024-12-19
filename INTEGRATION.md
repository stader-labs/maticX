# Integration guide

Deployment addresses can be found at:

- Mainnet: [mainnet-deployment-info.json](mainnet-deployment-info.json)
- Testnet: [testnet-deployment-info.json](testnet-deployment-info.json)

## Ethereum

Liquid staking is achieved through `MaticX` contract and the yield-bearing ERC-20 token `MaticX` is given to the user.

### 1. Stake Matic on Ethereum

Send Matic and receive liquid staking MaticX token.  
_MaticX approval should be given prior._

```SOLIDITY
IMatic matic = IMatic(MATIC_ADDRESS);
IMaticX maticX = IMaticX(MATICX_ADDRESS);
require(matic.approve(MATICX_ADDRESS, _amountInMatic), "Not approved");
uint256 amountInMaticX = maticX.submit(_amountInMatic);

emit StakeEvent(msg.sender, msg.value, amountInMaticX);
```

### 2. Unstake Matic on Ethereum

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

### 3. Claim Matic on Ethereum

After 3-4 days (80 checkpoints), Matic can be withdrawn.

```SOLIDITY
IMatic matic = IMatic(MATIC_ADDRESS);
IMaticX maticX = IMaticX(MATICX_ADDRESS);

// Claim all available withdrawal requests
WithdrawalRequest[] memory requests = getUserWithdrawalRequests(
    msg.sender
);

// StakeManager is necessary to check the availability of the withdrawal request
IStakeManager stakeManager = IStakeManager(STAKEMANAGER_ADDRESS);
// Important: Looping from the beginning doesn't work due to
// non-shifting removal from the withdrawal request array.
for (uint256 idx = requests.length - 1; idx >= 0; idx--) {
    WithdrawalRequest request = requests[idx].amount;
    if (stakeManager.epoch() < request.requestEpoch) continue;

    uint256 amountInMaticBefore = matic.balanceOf(msg.sender);
    // Swaps the given index with the latest item and reduces the size.
    // . V . .
    // 6 1 4 9 Original array
    // 6 9 4 9 Swapping with the latest item
    // 6 9 4   Final array
    maticX.claimWithdrawal(idx);
    uint256 amountInMaticAfter = matic.balanceOf(msg.sender);

    emit ClaimEvent(
        msg.sender,
        amountInMaticAfter - amountInMaticBefore
    );
}
```

### Full example on Ethereum

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
    address private STAKEMANAGER_ADDRESS =
        "0x5e3Ef299fDDf15eAa0432E6e66473ace8c13D908"; //mainnet address

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

    function claim() external {
        IMatic matic = IMatic(MATIC_ADDRESS);
        IMaticX maticX = IMaticX(MATICX_ADDRESS);

        // Claim all available withdrawal requests
        WithdrawalRequest[] memory requests = getUserWithdrawalRequests(
            msg.sender
        );

        // StakeManager is necessary to check the availability of the withdrawal request
        IStakeManager stakeManager = IStakeManager(STAKEMANAGER_ADDRESS);
        // Important: Looping from the beginning doesn't work due to
        // non-shifting removal from the withdrawal request array.
        for (uint256 idx = requests.length - 1; idx >= 0; idx--) {
            WithdrawalRequest request = requests[idx].amount;
            if (stakeManager.epoch() < request.requestEpoch) continue;

            uint256 amountInMaticBefore = matic.balanceOf(msg.sender);
            // Swaps the given index with the latest item and reduces the size.
            // . V . .
            // 6 1 4 9 Original array
            // 6 9 4 9 Swapping with the latest item
            // 6 9 4   Final array
            maticX.claimWithdrawal(idx);
            uint256 amountInMaticAfter = matic.balanceOf(msg.sender);

            emit ClaimEvent(
                msg.sender,
                amountInMaticAfter - amountInMaticBefore
            );
        }
    }
}
```

## Polygon

Liquid staking is achieved through `ChildPool` contract and the yield-bearing ERC-20 token `MaticX` is given to the user.

### 1. Stake Matic on Polygon

Send Matic and receive liquid staking MaticX token.
_There should be enough MaticX token in the pool_

```SOLIDITY
IMaticX maticX = IMaticX(MATICX_ADDRESS);
IChildPool childPool = IChildPool(CHILDPOOL_ADDRESS);

// Check the liquidity of the pool
uint256 availableMaticXAmount = childPool.instantPoolMaticX();
uint256 expectedMaticXAmount = childPool.convertMaticToMaticX(
    msg.value
);
require(
    availableMaticXAmount >= expectedMaticXAmount,
    "Not enough MaticX"
);

childPool.swapMaticForMaticXViaInstantPool{value: msg.value}();
uint256 amountInMaticX = maticX.balanceOf(msg.sender);

emit StakeEvent(msg.sender, msg.value, amountInMaticX);
```

### 2. Unstake Matic on Polygon

Send MaticX and create a withdrawal request.  
_MaticX approval should be given prior._
_There should be enough Matic token in the pool_

```SOLIDITY
IMaticX maticX = IMaticX(MATICX_ADDRESS);
IChildPool childPool = IChildPool(CHILDPOOL_ADDRESS);
require(
    maticX.approve(CHILDPOOL_ADDRESS, _amountInMaticX),
    "Not approved"
);

// Check the liquidity of the pool
uint256 availableMaticAmount = childPool.instantPoolMatic();
uint256 expectedMaticAmount = childPool.convertMaticXToMatic(
    _amountInMaticX
);
require(
    availableMaticAmount >= expectedMaticAmount,
    "Not enough Matic"
);

childPool.requestMaticXSwap(_amountInMaticX);

emit UnstakeEvent(msg.sender, _amountInMaticX);
```

### 3. Claim Matic on Polygon

After 3-4 days (80 checkpoints), Matic can be withdrawn.

```SOLIDITY
IChildPool childPool = IChildPool(CHILDPOOL_ADDRESS);

// Claim all available withdrawal requests
WithdrawalRequest[] memory requests = getUserMaticXSwapRequests(
    msg.sender
);
// Important: Looping from the beginning doesn't work due to
// non-shifting removal from the withdrawal request array.
for (uint256 idx = requests.length - 1; idx >= 0; idx--) {
    WithdrawalRequest request = requests[idx].amount;
    if (block.timestamp < request.withdrawalTime) continue;

    uint256 amountInMatic = request.amount;
    // Swaps the given index with the latest item and reduces the size.
    // . V . .
    // 6 1 4 9 Original array
    // 6 9 4 9 Swapping with the latest item
    // 6 9 4   Final array
    childPool.claimMaticXSwap(idx);

    emit ClaimEvent(msg.sender, amountInMatic);
}
```

### Full example on Polygon

```SOLIDITY
pragma solidity ^0.8.0;

import "ChildPool.sol";
import "IMaticX.sol";

contract Example {
    event StakeEvent(
        address indexed _address,
        uint256 amountInMatic,
        uint256 amountInMaticX
    );
    event UnstakeEvent(address indexed _address, uint256 amountInMaticX);
    event ClaimEvent(address indexed _address, uint256 amountInMatic);

    address private CHILDPOOL_ADDRESS =
        "0xfd225C9e6601C9d38d8F98d8731BF59eFcF8C0E3"; //mainnet address
    address private MATICX_ADDRESS =
        "0xfa68fb4628dff1028cfec22b4162fccd0d45efb6"; //mainnet address

    function stake(uint256 _amountInMatic) external {
        IMaticX maticX = IMaticX(MATICX_ADDRESS);
        IChildPool childPool = IChildPool(CHILDPOOL_ADDRESS);

        // Check the liquidity of the pool
        uint256 availableMaticXAmount = childPool.instantPoolMaticX();
        uint256 expectedMaticXAmount = childPool.convertMaticToMaticX(
            msg.value
        );
        require(
            availableMaticXAmount >= expectedMaticXAmount,
            "Not enough MaticX"
        );

        childPool.swapMaticForMaticXViaInstantPool{value: msg.value}();
        uint256 amountInMaticX = maticX.balanceOf(msg.sender);

        emit StakeEvent(msg.sender, msg.value, amountInMaticX);
    }

    function unstake(uint256 _amountInMaticX) external {
        IMaticX maticX = IMaticX(MATICX_ADDRESS);
        IChildPool childPool = IChildPool(CHILDPOOL_ADDRESS);
        require(
            maticX.approve(CHILDPOOL_ADDRESS, _amountInMaticX),
            "Not approved"
        );

        // Check the liquidity of the pool
        uint256 availableMaticAmount = childPool.instantPoolMatic();
        uint256 expectedMaticAmount = childPool.convertMaticXToMatic(
            _amountInMaticX
        );
        require(
            availableMaticAmount >= expectedMaticAmount,
            "Not enough Matic"
        );

        childPool.requestMaticXSwap(_amountInMaticX);

        emit UnstakeEvent(msg.sender, _amountInMaticX);
    }

    function claim() external {
        IChildPool childPool = IChildPool(CHILDPOOL_ADDRESS);

        // Claim all available withdrawal requests
        WithdrawalRequest[] memory requests = getUserMaticXSwapRequests(
            msg.sender
        );
        // Important: Looping from the beginning doesn't work due to
        // non-shifting removal from the withdrawal request array.
        for (uint256 idx = requests.length - 1; idx >= 0; idx--) {
            WithdrawalRequest request = requests[idx].amount;
            if (block.timestamp < request.withdrawalTime) continue;

            uint256 amountInMatic = request.amount;
            // Swaps the given index with the latest item and reduces the size.
            // . V . .
            // 6 1 4 9 Original array
            // 6 9 4 9 Swapping with the latest item
            // 6 9 4   Final array
            childPool.claimMaticXSwap(idx);

            emit ClaimEvent(msg.sender, amountInMatic);
        }
    }
}
```
