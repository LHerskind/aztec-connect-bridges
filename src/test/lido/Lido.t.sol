// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.4;

import {Test} from "forge-std/Test.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {DefiBridgeProxy} from "./../../aztec/DefiBridgeProxy.sol";
import {RollupProcessor} from "./../../aztec/RollupProcessor.sol";

import {LidoBridge} from "./../../bridges/lido/LidoBridge.sol";
import {AztecTypes} from "./../../aztec/libraries/AztecTypes.sol";
import {ErrorLib} from "./../../bridges/base/ErrorLib.sol";

contract LidoTest is Test {
    // solhint-disable-next-line
    IERC20 private constant wstETH = IERC20(0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0);

    AztecTypes.AztecAsset private empty;
    AztecTypes.AztecAsset private ethAsset =
        AztecTypes.AztecAsset({id: 1, erc20Address: address(0), assetType: AztecTypes.AztecAssetType.ETH});
    AztecTypes.AztecAsset private wstETHAsset =
        AztecTypes.AztecAsset({id: 2, erc20Address: address(wstETH), assetType: AztecTypes.AztecAssetType.ERC20});

    RollupProcessor private rollupProcessor;
    DefiBridgeProxy private defiBridgeProxy;

    LidoBridge private bridge;

    function setUp() public {
        defiBridgeProxy = new DefiBridgeProxy();
        rollupProcessor = new RollupProcessor(address(defiBridgeProxy));

        bridge = new LidoBridge(address(rollupProcessor), address(rollupProcessor));
    }

    function testErrorCodes() public {
        vm.expectRevert(ErrorLib.InvalidCaller.selector);
        bridge.convert(empty, empty, empty, empty, 0, 0, 0, address(0));

        vm.startPrank(address(rollupProcessor));

        vm.expectRevert(ErrorLib.InvalidInputA.selector);
        bridge.convert(empty, empty, empty, empty, 0, 0, 0, address(0));

        vm.expectRevert(ErrorLib.InvalidOutputA.selector);
        bridge.convert(ethAsset, empty, empty, empty, 0, 0, 0, address(0));

        vm.expectRevert(ErrorLib.InvalidOutputA.selector);
        bridge.convert(wstETHAsset, empty, empty, empty, 0, 0, 0, address(0));

        vm.expectRevert(ErrorLib.AsyncDisabled.selector);
        bridge.finalise(wstETHAsset, empty, empty, empty, 0, 0);

        vm.stopPrank();
    }

    function testLidoBridge() public {
        validateLidoBridge(100e18, 50e18);
        validateLidoBridge(50000e18, 40000e18);
    }

    function testLidoDepositAll(uint128 _depositAmount) public {
        uint256 depositAmount = bound(_depositAmount, 1000, 10000 ether);
        validateLidoBridge(depositAmount, depositAmount);
    }

    function testLidoDepositPartial(uint128 _balance) public {
        uint256 balance = bound(_balance, 1000, 10000 ether);
        validateLidoBridge(balance, balance / 2);
    }

    function testMultipleDeposits(uint80 _a, uint80 _b) public {
        uint256 a = bound(_a, 1000, 10000 ether);
        uint256 b = bound(_b, 1000, 10000 ether);

        vm.deal(address(rollupProcessor), uint256(a) + b);

        // Convert ETH to wstETH
        validateETHToWstETH(a);
        validateETHToWstETH(b);
    }

    function testDepositThenPartialWithdraw(uint80 _a) public {
        uint256 a = bound(_a, 1000, 10000 ether);
        vm.deal(address(rollupProcessor), a);

        validateETHToWstETH(a);

        validateWstETHToETH(wstETH.balanceOf(address(rollupProcessor)) / 2);
    }

    /**
        Testing flow:
        1. Send ETH to bridge
        2. Get back wstETH
        3. Send wstETH to bridge
        4. Get back ETH
     */
    function validateLidoBridge(uint256 _balance, uint256 _depositAmount) public {
        // Send ETH to bridge

        vm.deal(address(rollupProcessor), _balance);

        // Convert ETH to wstETH
        validateETHToWstETH(_depositAmount);

        // convert wstETH back to ETH using the same bridge
        validateWstETHToETH(wstETH.balanceOf(address(rollupProcessor)));
    }

    function validateWstETHToETH(uint256 _depositAmount) public {
        uint256 beforeETHBalance = address(rollupProcessor).balance;
        uint256 beforeWstEthBalance = wstETH.balanceOf(address(rollupProcessor));

        (uint256 outputValueA, uint256 outputValueB, bool isAsync) = rollupProcessor.convert(
            address(bridge),
            wstETHAsset,
            empty,
            ethAsset,
            empty,
            _depositAmount,
            2,
            0
        );

        uint256 afterETHBalance = address(rollupProcessor).balance;
        uint256 afterWstETHBalance = wstETH.balanceOf(address(rollupProcessor));

        emit log_named_uint("After Exit ETH Balance ", afterETHBalance);
        emit log_named_uint("After Exit WstETH Balance", afterWstETHBalance);

        assertFalse(isAsync, "Async interaction");
        assertEq(outputValueB, 0, "OutputValueB not 0");
        assertGt(outputValueA, 0, "No Eth received");
        assertEq(afterETHBalance, beforeETHBalance + outputValueA, "ETH balance not maching");
        assertEq(afterWstETHBalance, beforeWstEthBalance - _depositAmount, "WST ETH balance not matching");
    }

    function validateETHToWstETH(uint256 _depositAmount) public {
        uint256 beforeETHBalance = address(rollupProcessor).balance;
        uint256 beforeWstETHBalance = wstETH.balanceOf(address(rollupProcessor));

        emit log_named_uint("Before ETH Balance", beforeETHBalance);
        emit log_named_uint("Before WstETHBalance", beforeWstETHBalance);

        (uint256 outputValueA, uint256 outputValueB, bool isAsync) = rollupProcessor.convert(
            address(bridge),
            ethAsset,
            empty,
            wstETHAsset,
            empty,
            _depositAmount,
            1,
            0
        );

        uint256 afterETHBalance = address(rollupProcessor).balance;
        uint256 afterWstETHBalance = wstETH.balanceOf(address(rollupProcessor));

        emit log_named_uint("After ETH Balance", afterETHBalance);
        emit log_named_uint("After WstETHBalance", afterWstETHBalance);

        assertFalse(isAsync, "Async interaction");
        assertEq(outputValueB, 0, "OutputValueB not 0");
        assertEq(afterETHBalance, beforeETHBalance - _depositAmount, "ETH balance not matching");
        assertGt(outputValueA, 0, "No WST ETH received");
        assertEq(afterWstETHBalance, beforeWstETHBalance + outputValueA, "WST ETH balance not matching");
    }
}
