// to test this script on the local ganache truffle test .\test\FantomLiquidationManager.test.js --network ganache

const {
    BN,
    constants,
    expectEvent,
    expectRevert,
  } = require('@openzeppelin/test-helpers')
const { ZERO_ADDRESS } = constants
  
const { expect } = require('chai')


const FantomLiquidationManager = artifacts.require('FantomLiquidationManager');
const FantomMintTokenRegistry = artifacts.require('FantomMintTokenRegistry');
const FantomDeFiTokenStorage = artifacts.require('FantomDeFiTokenStorage');
const FantomMint = artifacts.require('FantomMint');
const FantomMintAddressProvider = artifacts.require('FantomMintAddressProvider');
const FantomMintRewardDistribution= artifacts.require('FantomMintRewardDistribution');
const FantomFUSD = artifacts.require('FantomFUSD');
const TestToken = artifacts.require('TestToken');
const TestPriceOracleProxy = artifacts.require('TestPriceOracleProxy');

const weiToEther = (n) => {
    return web3.utils.fromWei(n.toString(), 'ether');
}

const etherToWei = (n) => {
    return new web3.utils.BN(
      web3.utils.toWei(n.toString(), 'ether')
    )
}


contract('Unit Test for FantomLiquidationManager', function ([owner, admin, account, bidder1, bidder2]) {

    beforeEach(async function () {

        this.fantomMintAddressProvider = await FantomMintAddressProvider.new({from:owner});
        await this.fantomMintAddressProvider.initialize(owner);

        this.fantomLiquidationManager = await FantomLiquidationManager.new({from:owner})
        await this.fantomLiquidationManager.initialize(owner, this.fantomMintAddressProvider.address);
        
        this.fantomMint = await FantomMint.new({form: owner});
        await this.fantomMint.initialize(owner, this.fantomMintAddressProvider.address);

        this.fantomMintTokenRegistry = await FantomMintTokenRegistry.new();
        await this.fantomMintTokenRegistry.initialize(owner);

        this.collateralPool = await FantomDeFiTokenStorage.new({from: owner});
        await this.collateralPool.initialize(this.fantomMintAddressProvider.address, true);
        
        this.debtPool = await FantomDeFiTokenStorage.new({from: owner});
        await this.debtPool.initialize(this.fantomMintAddressProvider.address, true);
        
        this.fantomFUSD = await FantomFUSD.new({from: owner});
        await this.fantomFUSD.initialize(owner);

        this.fantomMintRewardDistribution = await FantomMintRewardDistribution.new({from: owner});
        await this.fantomMintRewardDistribution.initialize(owner, this.fantomMintAddressProvider.address);

        this.testToken = await TestToken.new({from:owner});
        await this.testToken.initialize("wFTM", "wFTM", 18);       
        
        this.testOraclePriceProxy = await TestPriceOracleProxy.new({from: owner});
        
        await this.fantomMintAddressProvider.setFantomMint(this.fantomMint.address, {from: owner});
        await this.fantomMintAddressProvider.setCollateralPool(this.collateralPool.address, {from: owner});
        await this.fantomMintAddressProvider.setDebtPool(this.debtPool.address, {from: owner});
        await this.fantomMintAddressProvider.setTokenRegistry(this.fantomMintTokenRegistry.address, {from: owner});
        await this.fantomMintAddressProvider.setRewardDistribution(this.fantomMintRewardDistribution.address, {from:owner});
        await this.fantomMintAddressProvider.setPriceOracleProxy(this.testOraclePriceProxy.address, {from:owner});
        await this.fantomMintAddressProvider.setFantomLiquidationManager(this.fantomLiquidationManager.address, {from: owner});

        await this.testToken.mint(account, etherToWei(9999));

        await this.testOraclePriceProxy.setPrice(this.testToken.address, etherToWei(1));
        await this.testOraclePriceProxy.setPrice(this.fantomFUSD.address, etherToWei(1));
        
        await this.fantomMintTokenRegistry.addToken(this.testToken.address, "", this.testOraclePriceProxy.address, 18, true, true, false);
        await this.fantomMintTokenRegistry.addToken(this.fantomFUSD.address, "", this.testOraclePriceProxy.address, 18, true, false, true);

        await this.fantomFUSD.addMinter(this.fantomMint.address, {from:owner});

        await this.fantomLiquidationManager.updateFantomMintContractAddress(this.fantomMint.address, {from:owner});
        await this.fantomLiquidationManager.updateFantomUSDAddress(this.fantomFUSD.address);

    })

    describe('depositing collateral and minting fUSD', function () {
        
        it('gets the price of wFTM', async function() {
            const price = await this.testOraclePriceProxy.getPrice(this.testToken.address);
            //console.log(weiToEther(price));
            expect(weiToEther(price).toString()).to.be.equal('1');
        })

        it(`approves and deposits 9999 wFTM, 
        mints possible max amount of fUSD,
        lower the price of the test token,
        start the liquidation
        bidder1 bids the auction`, 
            async function() {
            await this.testToken.approve(this.fantomMint.address, etherToWei(9999), {from: account});

            const canDeposit = await this.fantomMintTokenRegistry.canDeposit(this.testToken.address);
            //console.log('canDeposit: ', canDeposit);
            expect(canDeposit).to.be.equal(true);
            
            await this.fantomMint.mustDeposit(this.testToken.address, etherToWei(9999), {from: account});
            const balance1 = await this.testToken.balanceOf(account);
            //console.log(balance.toString());
            expect(balance1).to.be.bignumber.equal('0');
            const balance2 = await this.collateralPool.balanceOf(account, this.testToken.address);
            //console.log(balance2.toString());
            expect(weiToEther(balance2)).to.be.equal('9999');
            const balance3 = await this.testToken.balanceOf(this.fantomMint.address);
            console.log('balance3: ', weiToEther(balance3));

            const maxToMint = await this.fantomMint.maxToMint(account, this.fantomFUSD.address, 32000);
            //console.log('maxToMint in ether: ', weiToEther(maxToMint));
            expect(maxToMint).to.be.bignumber.greaterThan('0');

            await this.fantomMint.mustMintMax(this.fantomFUSD.address, 32000, {from: account});
            const fUSDBalance = await this.fantomFUSD.balanceOf(account);
            //console.log('fUSD balance: ', weiToEther(fUSDBalance));
            expect(fUSDBalance).to.be.bignumber.greaterThan('0');
            expect(weiToEther(fUSDBalance)*1).to.be.lessThanOrEqual(weiToEther(maxToMint)*1);

            await this.testOraclePriceProxy.setPrice(this.testToken.address, etherToWei(0.5));

            const live = await this.fantomLiquidationManager.live();
            //console.log('live: ', live);
            expect(live).to.be.equal(true);

            const isEligible = await this.fantomLiquidationManager.collateralIsEligible(account);
            //console.log('isEligible: ', isEligible);
            expect(isEligible).to.be.equal(false);

            await this.fantomLiquidationManager.addAdmin(admin, {from:owner});
            const isAdmin = await this.fantomLiquidationManager.admins(admin);
            //console.log(isAdmin);
            expect(isAdmin).to.be.equal(true);

            await this.fantomLiquidationManager.startLiquidation(account, {from: admin});

            await this.fantomFUSD.mint(bidder1, etherToWei(500000), {from: owner});
            const bidder1fUSDBalance = await this.fantomFUSD.balanceOf(bidder1);
            console.log('bidder1fUSDBalance: ', weiToEther(bidder1fUSDBalance));

            const auctionInformation = await this.fantomLiquidationManager.auctionList(account);
            //console.log(auctionInformation);
            console.log("auction owner: ", auctionInformation.owner);
            console.log("auction start price: ", weiToEther(auctionInformation.startPrice));
            expect(auctionInformation.owner).to.be.equal(account);
            
            const buyValue = await this.fantomLiquidationManager.getBuyValue(this.testToken.address, etherToWei(9999));
            console.log('buyValue: ', weiToEther(buyValue));

            const currentPrice = await this.fantomLiquidationManager.getCurrentPrice(account);
            console.log('currentPrice: ', weiToEther(currentPrice));

            const debtValue = await this.fantomLiquidationManager.getDebtValue(account, this.testToken.address, etherToWei(9999));
            console.log('debtValue: ', weiToEther(debtValue));

            await this.fantomFUSD.approve(this.fantomLiquidationManager.address, bidder1fUSDBalance, {from: bidder1});
            const balance4 = await this.fantomLiquidationManager.fantomMintERC20Balance(this.testToken.address);
            console.log('balance4: ', weiToEther(balance4));
            await this.fantomLiquidationManager.fantomMintERC20Approve(this.testToken.address, etherToWei(9999), {from: owner});
            const fantomMintAllowance = await this.testToken.allowance(this.fantomMint.address, this.fantomLiquidationManager.address);
            console.log('fantomMintAllowance: ', weiToEther(fantomMintAllowance));

            await this.fantomLiquidationManager.bidAuction(account, this.testToken.address, etherToWei(9999), {from: bidder1});
            
        })

    })  
})