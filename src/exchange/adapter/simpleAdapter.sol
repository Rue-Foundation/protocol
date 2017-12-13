pragma solidity ^0.4.19;

import '../../assets/Asset.sol';
import '../thirdparty/SimpleMarket.sol';
import 'ds-proxy/proxy.sol';

/// @title SimpleAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice An adapter between the Melon protocol and DappHubs SimpleMarket
/// @notice The concept of this can be extended to for any fully decentralised exchanges such as OasisDex, Kyber, Bancor
contract simpleAdapter is DSProxy {

    // FIELDS

    // Constructor fields
    address public EXCHANGE; // Address of third party exchange being adapted

    // EVENTS

    event OrderUpdated(uint id);

    // PURE METHODS

    /// @dev Convert uint256 to bytes32
    function toBytes(uint256 x) returns (bytes b) {
        b = new bytes(32);
        assembly { mstore(add(b, 32), x) }
    }

    // VIEW METHODS

    function getLastOrderId()
        constant
        returns (uint)
    {
        return SimpleMarket(EXCHANGE).last_offer_id();
    }
    function isActive(uint id)
        constant
        returns (bool)
    {
        return SimpleMarket(EXCHANGE).isActive(id);
    }
    function getOwner(uint id)
        constant
        returns (address)
    {
        return SimpleMarket(EXCHANGE).getOwner(id);
    }
    function getOrder(uint id)
        constant
        returns (address, address, uint, uint)
    {
        var (
            sellQuantity,
            sellAsset,
            buyQuantity,
            buyAsset
        ) = SimpleMarket(EXCHANGE).getOffer(id);
        return (
            address(sellAsset),
            address(buyAsset),
            sellQuantity,
            buyQuantity
        );
    }
    function getTimestamp(uint id)
        constant
        returns (uint)
    {
        var (, , , , , timestamp) = SimpleMarket(EXCHANGE).offers(id);
        return timestamp;
    }

    // NON-CONSTANT METHODS


    /// @param ofTargetExchange Address of the exchange that is being adapted
    function simpleAdapter (address ofTargetExchange) {
        EXCHANGE = ofTargetExchange;
    }

    /// @notice Makes an order on the given exchange
    /// @dev Only use this in context of a delegatecall, as spending of sellAsset need to be approved first
    /// @param sellAsset Asset (as registered in Asset registrar) to be sold
    /// @param buyAsset Asset (as registered in Asset registrar) to be bought
    /// @param sellQuantity Quantity of sellAsset to be sold
    /// @param buyQuantity Quantity of buyAsset to be bought
    /// @return Order id
    function makeOrder(
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    )
        returns (uint id)
    {
        id = SimpleMarket(EXCHANGE).offer(
            sellQuantity,
            Asset(sellAsset),
            buyQuantity,
            Asset(buyAsset)
        );
        OrderUpdated(id);
    }

    /// @notice Takes an order on the given exchange
    /// @dev For this subset of adapter no immediate settlement can be expected
    /// @param id Order id
    /// @param quantity Quantity of order to be executed (For partial taking)
    /// @return Whether the takeOrder is successfully executed
    function takeOrder(
        uint id,
        uint quantity
    )
        returns (bool success)
    {
        success = SimpleMarket(EXCHANGE).buy(id, quantity);
        OrderUpdated(id);
    }

    /// @notice Cancels an order on the given exchange
    /// @dev Only use this in context of a delegatecall, as spending of sellAsset need to be approved first
    /// @param id Order id
    /// @return Whether the order is successfully cancelled
    function cancelOrder(
        uint id
    )
        returns (bool success)
    {
        success = SimpleMarket(EXCHANGE).cancel(id);
        OrderUpdated(id);
    }
}
