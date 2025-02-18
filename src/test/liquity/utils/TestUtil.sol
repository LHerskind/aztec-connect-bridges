// SPDX-License-Identifier: GPL-2.0-only
// Copyright 2022 Spilsbury Holdings Ltd
pragma solidity >=0.8.4;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";
import {DefiBridgeProxy} from "../../../aztec/DefiBridgeProxy.sol";
import {RollupProcessor} from "../../../aztec/RollupProcessor.sol";

import {MockPriceFeed} from "./MockPriceFeed.sol";
import {IPriceFeed} from "../../../interfaces/liquity/IPriceFeed.sol";

contract TestUtil is Test {
    DefiBridgeProxy internal defiBridgeProxy;
    RollupProcessor internal rollupProcessor;

    struct Token {
        address addr; // ERC20 Mainnet address
        IERC20 erc;
    }

    address internal constant LIQUITY_PRICE_FEED_ADDR = 0x4c517D4e2C851CA76d7eC94B805269Df0f2201De;

    mapping(bytes32 => Token) internal tokens;

    function setUpTokens() public {
        tokens["LUSD"].addr = 0x5f98805A4E8be255a32880FDeC7F6728C6568bA0;
        tokens["LUSD"].erc = IERC20(tokens["LUSD"].addr);

        tokens["WETH"].addr = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
        tokens["WETH"].erc = IERC20(tokens["WETH"].addr);

        tokens["LQTY"].addr = 0x6DEA81C8171D0bA574754EF6F8b412F2Ed88c54D;
        tokens["LQTY"].erc = IERC20(tokens["LQTY"].addr);
    }

    function rand(uint256 seed) public pure returns (uint256) {
        // I want a number between 1 WAD and 10 million WAD
        return uint256(keccak256(abi.encodePacked(seed))) % 10**25;
    }

    function setLiquityPrice(uint256 price) public {
        IPriceFeed mockFeed = new MockPriceFeed(price);
        vm.etch(LIQUITY_PRICE_FEED_ADDR, address(mockFeed).code);
        IPriceFeed feed = IPriceFeed(LIQUITY_PRICE_FEED_ADDR);
        assertEq(feed.fetchPrice(), price);
    }

    function dropLiquityPriceByHalf() public {
        uint256 currentPrice = IPriceFeed(LIQUITY_PRICE_FEED_ADDR).fetchPrice();
        setLiquityPrice(currentPrice / 2);
    }

    function _aztecPreSetup() internal {
        defiBridgeProxy = new DefiBridgeProxy();
        rollupProcessor = new RollupProcessor(address(defiBridgeProxy));
    }
}
