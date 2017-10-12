pragma solidity ^0.4.11;

import './Asset.sol';
import '../libraries/safeMath.sol';

/// @title PreminedAsset Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract PreminedAsset is Asset {
    using safeMath for uint;

    // METHODS

    function PreminedAsset(string name, string symbol, uint decimals, uint amount)
        Asset(name, symbol, decimals)
    {
        _balances[msg.sender] = _balances[msg.sender].add(amount);
        _supply = _supply.add(amount);
    }
}
