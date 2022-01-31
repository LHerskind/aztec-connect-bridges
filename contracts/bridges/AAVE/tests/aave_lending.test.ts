import chai, { expect } from "chai";

import hardhat, { ethers } from "hardhat";
import { TestToken, AztecAssetType, AztecAsset, RollupProcessor } from "../../../../src/rollup_processor";

import {
	AaveLendingBridge,
	AaveLendingBridge__factory,
	DefiBridgeProxy,
	DefiBridgeProxy__factory,
	ERC20,
	ERC20__factory,
	IAToken,
	IAToken__factory,
} from "../../../../typechain-types";
import { randomBytes } from "crypto";
import { BigNumber, Signer } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { parseUnits } from "@nomiclabs/hardhat-ethers/node_modules/@ethersproject/units";

const fixEthersStackTrace = (err: Error) => {
	err.stack! += new Error().stack;
	throw err;
};

describe("Aave DeFi bridge", function () {
	const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
	const aDaiAddress = "0x028171bCA77440897B824Ca71D1c56caC55b68A3";
	const aaveAddressProvider = "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5";

	let aaveBridge: AaveLendingBridge;
	let defiBridgeProxy: DefiBridgeProxy;
	let processor: RollupProcessor;
	let signer: SignerWithAddress;

	let dai: ERC20;
	let aDai: IAToken;

	const randomAddress = () => randomBytes(20).toString("hex");

	before(async () => {
		[signer] = await ethers.getSigners();
		console.log(`Blocknumber: ${await signer.provider?.getBlockNumber()}`);

		defiBridgeProxy = await (await new DefiBridgeProxy__factory(signer).deploy()).deployed();
		processor = await RollupProcessor.deploy(signer, defiBridgeProxy.address);
		aaveBridge = await (
			await new AaveLendingBridge__factory(signer).deploy(processor.address, aaveAddressProvider)
		).deployed();
		dai = ERC20__factory.connect(daiAddress, signer);
		aDai = IAToken__factory.connect(aDaiAddress, signer);
	});

	it("Add dai to zkAToken mapping", async () => {
		expect(await aaveBridge.underlyingToZkAToken(dai.address)).to.be.eq(ethers.constants.AddressZero);
		expect(await aaveBridge.setUnderlyingToZkAToken(dai.address));
		expect(await aaveBridge.underlyingToZkAToken(dai.address)).to.not.be.eq(ethers.constants.AddressZero);
	});

	it("Add invalid underlying asset to zkAToken mapping (revert expected)", async () => {
		expect(await aaveBridge.underlyingToZkAToken(aDai.address)).to.be.eq(ethers.constants.AddressZero);
		await expect(aaveBridge.setUnderlyingToZkAToken(aDai.address)).to.be.revertedWith(
			"AaveLendingBridge: NO_LENDING_POOL"
		);
		expect(await aaveBridge.underlyingToZkAToken(aDai.address)).to.be.eq(ethers.constants.AddressZero);
	});

	it("Add dai to zkAToken mapping again (revert expected)", async () => {
		expect(await aaveBridge.underlyingToZkAToken(dai.address)).to.not.be.eq(ethers.constants.AddressZero);
		await expect(aaveBridge.setUnderlyingToZkAToken(dai.address)).to.be.revertedWith(
			"AaveLendingBridge: ZK_TOKEN_SET"
		);
		expect(await aaveBridge.underlyingToZkAToken(dai.address)).to.not.be.eq(ethers.constants.AddressZero);
	});

	it("Fund processor with dai", async () => {
		const depositAmount = parseUnits("10000", 18);
		await processor.preFundContractWithToken(signer, {
			name: "DAI",
			amount: depositAmount,
			erc20Address: dai.address,
		});
	});

	it("Enter with money", async () => {
		const zkATokenAddress = await aaveBridge.underlyingToZkAToken(dai.address);
		const zkAToken = ERC20__factory.connect(zkATokenAddress, signer);

		const balanceBefore = {
			rollup: {
				DAI: await dai.balanceOf(processor.address),
				zk: await zkAToken.balanceOf(processor.address),
			},
			bridge: {
				aDAI: await aDai.balanceOf(aaveBridge.address),
				scaledDAI: await aDai.scaledBalanceOf(aaveBridge.address),
			},
		};

		const depositAmount = parseUnits("1000", 18);

		const inputAsset = {
			assetId: 1,
			erc20Address: dai.address,
			assetType: AztecAssetType.ERC20,
		};
		const outputAsset = {
			assetId: 2,
			erc20Address: zkAToken.address,
			assetType: AztecAssetType.ERC20,
		};

		const interactionNonce = BigNumber.from(1);
		const auxData = BigNumber.from(0);

		await processor.convert(
			signer,
			aaveBridge.address,
			inputAsset,
			{},
			outputAsset,
			{},
			depositAmount,
			interactionNonce,
			auxData
		);

		const balanceAfter = {
			rollup: {
				DAI: await dai.balanceOf(processor.address),
				zk: await zkAToken.balanceOf(processor.address),
			},
			bridge: {
				aDAI: await aDai.balanceOf(aaveBridge.address),
				scaledDAI: await aDai.scaledBalanceOf(aaveBridge.address),
			},
		};

		expect(balanceAfter.rollup.DAI).to.be.eq(balanceBefore.rollup.DAI.sub(depositAmount));
		expect(balanceAfter.rollup.zk).to.be.eq(balanceAfter.bridge.scaledDAI);
	});

	it("Enter with additional money", async () => {
		const zkATokenAddress = await aaveBridge.underlyingToZkAToken(dai.address);
		const zkAToken = ERC20__factory.connect(zkATokenAddress, signer);

		const balanceBefore = {
			rollup: {
				DAI: await dai.balanceOf(processor.address),
				zk: await zkAToken.balanceOf(processor.address),
			},
			bridge: {
				aDAI: await aDai.balanceOf(aaveBridge.address),
				scaledDAI: await aDai.scaledBalanceOf(aaveBridge.address),
			},
		};

		const depositAmount = parseUnits("3000", 18);

		const inputAsset = {
			assetId: 1,
			erc20Address: dai.address,
			assetType: AztecAssetType.ERC20,
		};
		const outputAsset = {
			assetId: 2,
			erc20Address: zkAToken.address,
			assetType: AztecAssetType.ERC20,
		};

		const interactionNonce = BigNumber.from(2);
		const auxData = BigNumber.from(0);

		await processor.convert(
			signer,
			aaveBridge.address,
			inputAsset,
			{},
			outputAsset,
			{},
			depositAmount,
			interactionNonce,
			auxData
		);

		const balanceAfter = {
			rollup: {
				DAI: await dai.balanceOf(processor.address),
				zk: await zkAToken.balanceOf(processor.address),
			},
			bridge: {
				aDAI: await aDai.balanceOf(aaveBridge.address),
				scaledDAI: await aDai.scaledBalanceOf(aaveBridge.address),
			},
		};

		expect(balanceAfter.rollup.DAI).to.be.eq(balanceBefore.rollup.DAI.sub(depositAmount));
		expect(balanceAfter.rollup.zk).to.be.eq(balanceAfter.bridge.scaledDAI);
	});

	it("Exit with partial amount", async () => {
		const zkATokenAddress = await aaveBridge.underlyingToZkAToken(dai.address);
		const zkAToken = ERC20__factory.connect(zkATokenAddress, signer);

		const balanceBefore = {
			rollup: {
				DAI: await dai.balanceOf(processor.address),
				zk: await zkAToken.balanceOf(processor.address),
			},
			bridge: {
				aDAI: await aDai.balanceOf(aaveBridge.address),
				scaledDAI: await aDai.scaledBalanceOf(aaveBridge.address),
			},
		};

		console.log(`Zk balance: ${balanceBefore.rollup.zk} scaled dai: ${balanceBefore.bridge.scaledDAI}`);
		const withdrawAmount = parseUnits("500", 18);

		const inputAsset = {
			assetId: 2,
			erc20Address: zkAToken.address,
			assetType: AztecAssetType.ERC20,
		};
		const outputAsset = {
			assetId: 1,
			erc20Address: dai.address,
			assetType: AztecAssetType.ERC20,
		};

		const interactionNonce = BigNumber.from(2);
		const auxData = BigNumber.from(0);

		await processor.convert(
			signer,
			aaveBridge.address,
			inputAsset,
			{},
			outputAsset,
			{},
			withdrawAmount,
			interactionNonce,
			auxData
		);

		const balanceAfter = {
			rollup: {
				DAI: await dai.balanceOf(processor.address),
				zk: await zkAToken.balanceOf(processor.address),
			},
			bridge: {
				aDAI: await aDai.balanceOf(aaveBridge.address),
				scaledDAI: await aDai.scaledBalanceOf(aaveBridge.address),
			},
		};

		// Need to compute the expected amount withdraw using the actual index etc.
		expect(balanceAfter.rollup.zk).to.be.eq(balanceBefore.rollup.zk.sub(withdrawAmount));
		expect(balanceAfter.rollup.zk).to.be.eq(balanceAfter.bridge.scaledDAI);

		// expect(balanceAfter.rollup.DAI).to.be.eq(balanceBefore.rollup.DAI.add(depositAmount));
		// expect(balanceAfter.rollup.zk).to.be.eq(balanceAfter.bridge.scaledDAI);
	});
	
	it("Exit with partial amount", async () => {
		const zkATokenAddress = await aaveBridge.underlyingToZkAToken(dai.address);
		const zkAToken = ERC20__factory.connect(zkATokenAddress, signer);

		const balanceBefore = {
			rollup: {
				DAI: await dai.balanceOf(processor.address),
				zk: await zkAToken.balanceOf(processor.address),
			},
			bridge: {
				aDAI: await aDai.balanceOf(aaveBridge.address),
				scaledDAI: await aDai.scaledBalanceOf(aaveBridge.address),
			},
		};

		console.log(`Zk balance: ${balanceBefore.rollup.zk} scaled dai: ${balanceBefore.bridge.scaledDAI}`);
		const withdrawAmount = parseUnits("500", 18);

		const inputAsset = {
			assetId: 2,
			erc20Address: zkAToken.address,
			assetType: AztecAssetType.ERC20,
		};
		const outputAsset = {
			assetId: 1,
			erc20Address: dai.address,
			assetType: AztecAssetType.ERC20,
		};

		const interactionNonce = BigNumber.from(2);
		const auxData = BigNumber.from(0);

		await processor.convert(
			signer,
			aaveBridge.address,
			inputAsset,
			{},
			outputAsset,
			{},
			withdrawAmount,
			interactionNonce,
			auxData
		);

		const balanceAfter = {
			rollup: {
				DAI: await dai.balanceOf(processor.address),
				zk: await zkAToken.balanceOf(processor.address),
			},
			bridge: {
				aDAI: await aDai.balanceOf(aaveBridge.address),
				scaledDAI: await aDai.scaledBalanceOf(aaveBridge.address),
			},
		};

		// Need to compute the expected amount withdraw using the actual index etc.
		expect(balanceAfter.rollup.zk).to.be.eq(balanceBefore.rollup.zk.sub(withdrawAmount));
		expect(balanceAfter.rollup.zk).to.be.eq(balanceAfter.bridge.scaledDAI);

		// expect(balanceAfter.rollup.DAI).to.be.eq(balanceBefore.rollup.DAI.add(depositAmount));
		// expect(balanceAfter.rollup.zk).to.be.eq(balanceAfter.bridge.scaledDAI);
	});

	it("Exit with partial amount", async () => {
		const zkATokenAddress = await aaveBridge.underlyingToZkAToken(dai.address);
		const zkAToken = ERC20__factory.connect(zkATokenAddress, signer);

		const balanceBefore = {
			rollup: {
				DAI: await dai.balanceOf(processor.address),
				zk: await zkAToken.balanceOf(processor.address),
			},
			bridge: {
				aDAI: await aDai.balanceOf(aaveBridge.address),
				scaledDAI: await aDai.scaledBalanceOf(aaveBridge.address),
			},
		};

		console.log(`Zk balance: ${balanceBefore.rollup.zk} scaled dai: ${balanceBefore.bridge.scaledDAI}`);
		const withdrawAmount = BigNumber.from(1);

		const inputAsset = {
			assetId: 2,
			erc20Address: zkAToken.address,
			assetType: AztecAssetType.ERC20,
		};
		const outputAsset = {
			assetId: 1,
			erc20Address: dai.address,
			assetType: AztecAssetType.ERC20,
		};

		const interactionNonce = BigNumber.from(2);
		const auxData = BigNumber.from(0);

		await processor.convert(
			signer,
			aaveBridge.address,
			inputAsset,
			{},
			outputAsset,
			{},
			withdrawAmount,
			interactionNonce,
			auxData
		);

		const balanceAfter = {
			rollup: {
				DAI: await dai.balanceOf(processor.address),
				zk: await zkAToken.balanceOf(processor.address),
			},
			bridge: {
				aDAI: await aDai.balanceOf(aaveBridge.address),
				scaledDAI: await aDai.scaledBalanceOf(aaveBridge.address),
			},
		};

		// Need to compute the expected amount withdraw using the actual index etc.
		expect(balanceAfter.rollup.zk).to.be.eq(balanceBefore.rollup.zk.sub(withdrawAmount));
		expect(balanceAfter.rollup.zk).to.be.eq(balanceAfter.bridge.scaledDAI);

		// expect(balanceAfter.rollup.DAI).to.be.eq(balanceBefore.rollup.DAI.add(depositAmount));
		// expect(balanceAfter.rollup.zk).to.be.eq(balanceAfter.bridge.scaledDAI);
	});

	it("Exit with all", async () => {
		// TODO: it breaks for some reason
		const zkATokenAddress = await aaveBridge.underlyingToZkAToken(dai.address);
		const zkAToken = ERC20__factory.connect(zkATokenAddress, signer);

		const balanceBefore = {
			rollup: {
				DAI: await dai.balanceOf(processor.address),
				zk: await zkAToken.balanceOf(processor.address),
			},
			bridge: {
				aDAI: await aDai.balanceOf(aaveBridge.address),
				scaledDAI: await aDai.scaledBalanceOf(aaveBridge.address),
			},
		};

		const withdrawAmount = balanceBefore.rollup.zk;

		const inputAsset = {
			assetId: 2,
			erc20Address: zkAToken.address,
			assetType: AztecAssetType.ERC20,
		};
		const outputAsset = {
			assetId: 1,
			erc20Address: dai.address,
			assetType: AztecAssetType.ERC20,
		};

		const interactionNonce = BigNumber.from(2);
		const auxData = BigNumber.from(0);

		await processor.convert(
			signer,
			aaveBridge.address,
			inputAsset,
			{},
			outputAsset,
			{},
			withdrawAmount,
			interactionNonce,
			auxData
		);

		const balanceAfter = {
			rollup: {
				DAI: await dai.balanceOf(processor.address),
				zk: await zkAToken.balanceOf(processor.address),
			},
			bridge: {
				aDAI: await aDai.balanceOf(aaveBridge.address),
				scaledDAI: await aDai.scaledBalanceOf(aaveBridge.address),
			},
		};

		expect(balanceAfter.rollup.zk).to.be.eq(0);
		expect(balanceAfter.bridge.scaledDAI).to.be.eq(0);
		expect(balanceAfter.bridge.aDAI).to.be.eq(0);

		// Need to compute the expected amount withdraw using the actual index etc.

		// expect(balanceAfter.rollup.DAI).to.be.eq(balanceBefore.rollup.DAI.add(depositAmount));
		// expect(balanceAfter.rollup.zk).to.be.eq(balanceAfter.bridge.scaledDAI);

		// TODO: There seems to be some rounding issues that we should look at.
	});

	it("Call finalize (revert expected)", async () => {
		// TODO:
	});
});
