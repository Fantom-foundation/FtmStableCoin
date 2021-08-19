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


contract('Unit Test for FantomLiquidationManager', function ([owner, admin, borrower, bidder1, bidder2]) {

    beforeEach(async function () {

        /** all the necessary setup  */
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

        // mint 9999 wFTMs for borrower so he/she can borrow some fUSD
        await this.testToken.mint(borrower, etherToWei(9999));

        // mint bidder1 enough fUSD to bid for liquidated collateral
        await this.fantomFUSD.mint(bidder1, etherToWei(500000), {from: owner});
        //const bidder1fUSDBalance = await this.fantomFUSD.balanceOf(bidder1);
        //console.log('bidder1fUSDBalance: ', weiToEther(bidder1fUSDBalance));

        // set the initial value; 1 wFTM = 1 USD; 1 fUSD = 1 USD
        await this.testOraclePriceProxy.setPrice(this.testToken.address, etherToWei(1));
        await this.testOraclePriceProxy.setPrice(this.fantomFUSD.address, etherToWei(1));
        
        await this.fantomMintTokenRegistry.addToken(this.testToken.address, "", this.testOraclePriceProxy.address, 18, true, true, false);
        await this.fantomMintTokenRegistry.addToken(this.fantomFUSD.address, "", this.testOraclePriceProxy.address, 18, true, false, true);

        await this.fantomFUSD.addMinter(this.fantomMint.address, {from:owner});

        await this.fantomLiquidationManager.updateFantomMintContractAddress(this.fantomMint.address, {from:owner});
        await this.fantomLiquidationManager.updateFantomUSDAddress(this.fantomFUSD.address);
        
        /** all the necesary setup */

    })

    describe('depositing collateral and minting fUSD', function () {
        
        it('gets the price of wFTM', async function() {
            // check the initial value of wFTM
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
            // borrower needs to approve his/her wFTM transfer by FantomMint contract
            await this.testToken.approve(this.fantomMint.address, etherToWei(9999), {from: borrower});

            // make sure the wFTM (test token) can be registered
            const canDeposit = await this.fantomMintTokenRegistry.canDeposit(this.testToken.address);
            //console.log('canDeposit: ', canDeposit);
            expect(canDeposit).to.be.equal(true);
            
            // borrower deposits all his/her 9999 wFTM
            await this.fantomMint.mustDeposit(this.testToken.address, etherToWei(9999), {from: borrower});
            const balance1 = await this.testToken.balanceOf(borrower);
            //console.log(balance.toString());
            // he/she now has no wFTM
            expect(balance1).to.be.bignumber.equal('0');

            // check the collateral balance of the borrower in the collateral pool
            const balance2 = await this.collateralPool.balanceOf(borrower, this.testToken.address);
            //console.log(balance2.toString());            
            expect(weiToEther(balance2)).to.be.equal('9999');

            // now FantoMint contract should get 9999 wFTM
            const balance3 = await this.testToken.balanceOf(this.fantomMint.address);
            //console.log('balance3: ', weiToEther(balance3));
            expect(weiToEther(balance3)).to.be.equal('9999');

            // check the mint maximum amount possible of fUSD for borrower
            const maxToMint = await this.fantomMint.maxToMint(borrower, this.fantomFUSD.address, 32000);
            //console.log('maxToMint in ether: ', weiToEther(maxToMint));
            expect(maxToMint).to.be.bignumber.greaterThan('0');
            expect(weiToEther(maxToMint)*1).to.be.lessThanOrEqual(3333);

            // mint maximum amount possible of fUSD for borrower
            await this.fantomMint.mustMintMax(this.fantomFUSD.address, 32000, {from: borrower});
            const fUSDBalance = await this.fantomFUSD.balanceOf(borrower);
            //console.log('fUSD balance: ', weiToEther(fUSDBalance));
            expect(fUSDBalance).to.be.bignumber.greaterThan('0');
            expect(weiToEther(fUSDBalance)*1).to.be.lessThanOrEqual(weiToEther(maxToMint)*1);

            // assume: the value of wFTM has changed to 0.5 USD !!
            await this.testOraclePriceProxy.setPrice(this.testToken.address, etherToWei(0.5));

            // make sure it's live
            const live = await this.fantomLiquidationManager.live();
            //console.log('live: ', live);
            expect(live).to.be.equal(true);

            // make sure the collateral isn't eligible any more
            const isEligible = await this.fantomLiquidationManager.collateralIsEligible(borrower);
            //console.log('isEligible: ', isEligible);
            expect(isEligible).to.be.equal(false);

            // owner adds another admin
            await this.fantomLiquidationManager.addAdmin(admin, {from:owner});
            const isAdmin = await this.fantomLiquidationManager.admins(admin);
            //console.log(isAdmin);
            expect(isAdmin).to.be.equal(true);

            // liquidataion is started by the newly added admin
            await this.fantomLiquidationManager.startLiquidation(borrower, {from: admin});
            
            // make sure the borrow is the auction list
            const auctionInformation = await this.fantomLiquidationManager.auctionList(borrower);
            //console.log("auction owner: ", auctionInformation.owner);
            //console.log("auction start price: ", weiToEther(auctionInformation.startPrice));
            expect(auctionInformation.owner).to.be.equal(borrower);
                        
            /* const buyValue = await this.fantomLiquidationManager.getBuyValue(this.testToken.address, etherToWei(9999));
            console.log('buyValue: ', weiToEther(buyValue));

            const currentPrice = await this.fantomLiquidationManager.getCurrentPrice(borrower);
            console.log('currentPrice: ', weiToEther(currentPrice)); */

            // get the value that bidder1 has to pay
            const debtValue = await this.fantomLiquidationManager.getDebtValue(borrower, this.testToken.address, etherToWei(9999));
            // console.log('debtValue: ', weiToEther(debtValue));

            // bidder1 approve the transfer of the neccessary amount by FantomLiquidationManager
            await this.fantomFUSD.approve(this.fantomLiquidationManager.address, debtValue, {from: bidder1});

            /* const balance4 = await this.fantomLiquidationManager.fantomMintERC20Balance(this.testToken.address);
            console.log('balance4: ', weiToEther(balance4));
            expect(weiToEther(balance4)*1).to.be.equal(9999); */

            // bidder1 bids
            await this.fantomLiquidationManager.bidAuction(borrower, this.testToken.address, etherToWei(9999), {from: bidder1});

            // make sure FantomMint contract now no longer has the collateral and has transferred it to bidder
            const balance5 = await this.testToken.balanceOf(this.fantomMint.address);
            //console.log('balance5: ', weiToEther(balance5));
            expect(weiToEther(balance5)*1).to.be.equal(0);
            const balance6 = await this.testToken.balanceOf(bidder1);
            //console.log('balance6: ', weiToEther(balance6));
            expect(weiToEther(balance6)*1).to.be.equal(9999);

            // the fUSD balance of bidder1 should be less than the initial amount
            const balance7 = await this.fantomFUSD.balanceOf(bidder1);
            //console.log('balance7: ', weiToEther(balance7));
            expect(weiToEther(balance7)*1).to.be.lessThan(500000);

            // make sure FantomLiquidation gets the correct amount of fUSDs from bidder
            const balance8 = await this.fantomFUSD.balanceOf(this.fantomLiquidationManager.address);
            //console.log('balance8: ', weiToEther(balance8));
            expect(weiToEther(balance8)*1).to.be.equal(1666.5);
        
            
        })

    })  
})