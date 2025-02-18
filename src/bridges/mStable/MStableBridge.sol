// SPDX-License-Identifier: GPL-2.0-only
// Copyright 2022 Spilsbury Holdings Ltd
pragma solidity >=0.6.10 <=0.8.10;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IMStableAsset} from "../../interfaces/mstable/IMStableAsset.sol";
import {IMStableSavingsContract} from "../../interfaces/mstable/IMStableSavingsContract.sol";
import {AztecTypes} from "../../aztec/libraries/AztecTypes.sol";
import {BridgeBase} from "../base/BridgeBase.sol";

contract MStableBridge is BridgeBase {
    constructor(address _rollupProcessor) BridgeBase(_rollupProcessor) {}

    // convert the input asset to the output asset
    // serves as the 'on ramp' to the interaction
    function convert(
        AztecTypes.AztecAsset calldata inputAssetA,
        AztecTypes.AztecAsset calldata,
        AztecTypes.AztecAsset calldata outputAssetA,
        AztecTypes.AztecAsset calldata,
        uint256 totalInputValue,
        uint256,
        uint64 auxData,
        address
    )
        external
        payable
        override(BridgeBase)
        onlyRollup
        returns (
            uint256 outputValueA,
            uint256,
            bool isAsync
        )
    {
        require(inputAssetA.id != outputAssetA.id, "MStableBridge: ASSET_IDS_EQUAL");

        require(inputAssetA.assetType == AztecTypes.AztecAssetType.ERC20, "MStableBridge: NOT_ERC20");
        // operation is asynchronous
        isAsync = false;

        address mUSD = address(0xe2f2a5C287993345a840Db3B0845fbC70f5935a5);
        address imUSD = address(0x30647a72Dc82d7Fbb1123EA74716aB8A317Eac19);
        address dai = address(0x6B175474E89094C44Da98b954EedeAC495271d0F);

        if (outputAssetA.erc20Address == imUSD) {
            ERC20(inputAssetA.erc20Address).approve(address(mUSD), totalInputValue);

            uint256 minimumMUSDToMint = (totalInputValue * ((uint256(10000) - uint256(auxData)))) / 10000;
            uint256 massetsMinted = IMStableAsset(mUSD).mint(dai, totalInputValue, minimumMUSDToMint, address(this)); // Minting

            ERC20(mUSD).approve(imUSD, massetsMinted);

            outputValueA = IMStableSavingsContract(imUSD).depositSavings(massetsMinted); // Deposit into save

            ERC20(imUSD).approve(ROLLUP_PROCESSOR, outputValueA);
        } else {
            uint256 redeemedMUSD = IMStableSavingsContract(imUSD).redeemCredits(totalInputValue);
            uint256 minimumBAssetToRedeem = (redeemedMUSD * ((uint256(10000) - uint256(auxData)))) / 10000;
            uint256 redeemedValue = IMStableAsset(mUSD).redeem(dai, redeemedMUSD, minimumBAssetToRedeem, address(this));
            outputValueA = redeemedValue;
            ERC20(dai).approve(ROLLUP_PROCESSOR, outputValueA);
        }
    }
}
