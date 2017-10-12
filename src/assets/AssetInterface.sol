pragma solidity ^0.4.11;

import 'erc20/erc20.sol';

/// @title Asset Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Asset Contract
/// @notice This extends the ERC20 Interface
contract AssetInterface is ERC20 {

    // CONSTANT METHODS

    function getName() constant returns (string) {}
    function getSymbol() constant returns (string) {}
    function getDecimals() constant returns (uint) {}
}
