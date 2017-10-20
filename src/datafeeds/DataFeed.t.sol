pragma solidity ^0.4.11;

import "ds-test/test.sol";
import "./DataFeed.sol";
import "../assets/PreminedAsset.sol";
import "../assets/EtherToken.sol";


contract DataFeedTest is DSTest {
    DataFeed datafeed;
    PreminedAsset melonToken;
    EtherToken etherToken;

    // constants
    uint INTERVAL = 0;
    uint VALIDITY = 60;
    string MELON_NAME = "Melon Token";
    string MELON_SYMBOL = "MLN-T";
    uint MELON_DECIMALS = 18;
    string MELON_URL = "https://www.melonport.com";
    bytes32 MOCK_IPFS_HASH = 0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b;
    bytes32 MOCK_CHAIN_ID = 0xd8344c361317e3736173f8da91dec3ca1de32f3cc0a895fd6363fbc20fd21985;
    address MOCK_BREAK_IN = 0x2186C5EaAf6CbF55BF1b9cD8130D8a6A71E4486a;
    address MOCK_BREAK_OUT = 0xd9AE70149D256D4645c03aB9D5423A1B70d8804d;

    uint PREMINED_AMOUNT = 10 ** 28;

    // mock data
    uint inputEtherTokenPrice = 4152823920265781000;
    uint inputMelonTokenPrice = 1000000000000000000;

    function setUp() {
        melonToken = new PreminedAsset(MELON_NAME, MELON_SYMBOL, MELON_DECIMALS, PREMINED_AMOUNT);
        etherToken = new EtherToken();
        datafeed = new DataFeed(melonToken, MELON_NAME, MELON_SYMBOL, MELON_DECIMALS, MELON_URL, MOCK_IPFS_HASH, MOCK_CHAIN_ID, MOCK_BREAK_IN, MOCK_BREAK_OUT, INTERVAL, VALIDITY);
    }

    function testSetupSucceeded() {
        address quoteAsset = datafeed.getQuoteAsset();
        uint returnedInterval = datafeed.getInterval();
        uint returnedValidity = datafeed.getValidity();
        bool quoteAssetIsRegistered = datafeed.isRegistered(quoteAsset);

        assertEq(quoteAsset, melonToken);
        assertEq(returnedInterval, INTERVAL);
        assertEq(returnedValidity, VALIDITY);
        assert(quoteAssetIsRegistered);
    }

    function testFailGetPriceBeforeSet() {
        datafeed.getPrice(etherToken);
    }

// TODO: uncomment when dapphub/ds-test#5 is resolved
//    function testUpdateAndGetPrice() {
//        address[] storage assetArray;
//        uint[] storage priceArray;
//        assetArray.push(etherToken);
//        assetArray.push(melonToken);
//        priceArray.push(inputEtherTokenPrice);
//        priceArray.push(inputMelonTokenPrice);
//
//        datafeed.update(assetArray, priceArray);
//        uint returnedEtherTokenPrice = datafeed.getPrice(etherToken);
//        uint returnedMelonTokenPrice = datafeed.getPrice(melonToken);
//
//        assertEq(returnedEtherTokenPrice, inputEtherTokenPrice);
//        assertEq(returnedMelonTokenPrice, inputMelonTokenPrice);
//    }
}
