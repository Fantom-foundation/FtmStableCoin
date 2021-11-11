// to test this script on the local ganache truffle test .\test\FantomLiquidationManager.test.js --network ganache

const {
    BN,
    constants,
    expectEvent,
    expectRevert,
    time
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


contract('Unit Test for FantomLiquidationManager', function ([owner, admin, borrower, bidder1, bidder2, fantomFeeVault]) {

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

        it(`Scenario 1:
        borrower approves and deposits 9999 wFTM, 
        then mints possible max amount of fUSD,
        the price of the wFTM changes from 1 to 0.5,
        the liquidation starts
        bidder1 bids the auction to get all 9999 wFTM`, 
            async function() {
            
            // mint 9999 wFTMs for borrower so he/she can borrow some fUSD
            await this.testToken.mint(borrower, etherToWei(9999));

            // mint bidder1 enough fUSD to bid for liquidated collateral
            await this.fantomFUSD.mint(bidder1, etherToWei(500000), {from: owner});
            //const bidder1fUSDBalance = await this.fantomFUSD.balanceOf(bidder1);
            //console.log('bidder1fUSDBalance: ', weiToEther(bidder1fUSDBalance));
            
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
            console.log('maxToMint in ether: ', weiToEther(maxToMint));
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

            // set the debtValue-buyValue ratio to 1
            await this.fantomLiquidationManager.updateAuctionBeginPrice(10000, {from:owner});

            const debtValueBeforeLiquidation = await this.fantomLiquidationManager.getDebtValue(borrower);
            console.log('debtValueBeforeLiquidation: ', weiToEther(debtValueBeforeLiquidation));
            
            // liquidataion is started by the newly added admin
            const result = await this.fantomLiquidationManager.startLiquidation(borrower, {from: admin});
            
            const debtValueAfterLiquidation = await this.fantomLiquidationManager.getDebtValue(borrower);
            console.log('debtValueAfterLiquidation: ', weiToEther(debtValueAfterLiquidation));
            
            expectEvent.inLogs(result.logs, 'AuctionStarted',{
                nonce: new BN('1'),
                user: borrower
            })
            //const currentPrice = await this.fantomLiquidationManager.getCurrentPrice(borrower);
            //console.log('currentPrice: ', weiToEther(currentPrice)); 

            

            // bidder1 approve the transfer of the neccessary amount by FantomLiquidationManager
            //await this.fantomFUSD.approve(this.fantomLiquidationManager.address, debtValueBeforeLiquidation, {from: bidder1});

            const balanceOfRemainingDebt = await this.fantomLiquidationManager.balanceOfRemainingDebt(1);
            console.log('balanceOfRemainingDebt: ', weiToEther(balanceOfRemainingDebt));

            await this.fantomFUSD.approve(this.fantomLiquidationManager.address, balanceOfRemainingDebt, {from: bidder1});


            // const balance4 = await this.fantomLiquidationManager.fantomMintERC20Balance(this.testToken.address);
            // console.log('balance4: ', weiToEther(balance4));
            // expect(weiToEther(balance4)*1).to.be.equal(9999);

            // bidder1 bids
            //await this.fantomLiquidationManager.bidAuction(borrower, this.testToken.address, etherToWei(9999), {from: bidder1});
            await this.fantomLiquidationManager.updateFantomFeeVault(fantomFeeVault, {from:owner});
            await this.fantomLiquidationManager.bidAuction(1, new BN('50000000'), {from: bidder1});
            // make sure FantomMint contract now no longer has the collateral and has transferred it to bidder
            //const balance5 = await this.testToken.balanceOf(this.fantomMint.address);
            //console.log('balance5: ', weiToEther(balance5));
            //expect(weiToEther(balance5)*1).to.be.equal(0);
            //const balance6 = await this.testToken.balanceOf(bidder1);
            //console.log('balance6: ', weiToEther(balance6));
            //expect(weiToEther(balance6)*1).to.be.equal(9999);

            // the fUSD balance of bidder1 should be less than the initial amount
            //const balance7 = await this.fantomFUSD.balanceOf(bidder1);
            //console.log('balance7: ', weiToEther(balance7));
            //expect(weiToEther(balance7)*1).to.be.lessThan(500000);

            // make sure FantomLiquidation gets the correct amount of fUSDs from bidder
            //const balance8 = await this.fantomFUSD.balanceOf(this.fantomLiquidationManager.address);
            //console.log('balance8: ', weiToEther(balance8));
            //expect(weiToEther(balance8)*1).to.be.equal(4999.5);
                    
        })         

        /*
        it(`Scenario 2:
        borrower approves and deposits 9999 wFTM, 
        then mints possible max amount of fUSD,
        the price of wFTM changes from 1 to 0.5,
        the liquidation starts
        bidder1 bids the auction to get 5000 wFTM
        `,
            async function() {
            // mint 9999 wFTMs for borrower so he/she can borrow some fUSD
            await this.testToken.mint(borrower, etherToWei(9999));

            // mint bidder1 enough fUSD to bid for liquidated collateral
            await this.fantomFUSD.mint(bidder1, etherToWei(500000), {from: owner});
            //const bidder1fUSDBalance = await this.fantomFUSD.balanceOf(bidder1);
            //console.log('bidder1fUSDBalance: ', weiToEther(bidder1fUSDBalance));

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

            // set the debtValue-buyValue ratio to 1
            await this.fantomLiquidationManager.updateAuctionBeginPrice(10000, {from:owner});

            // liquidataion is started by the newly added admin
            await this.fantomLiquidationManager.startLiquidation(borrower, {from: admin});

            // make sure the borrow is the auction list
            const auctionInformation = await this.fantomLiquidationManager.auctionList(borrower);
            //console.log("auction owner: ", auctionInformation.owner);
            //console.log("auction start price: ", weiToEther(auctionInformation.startPrice));
            expect(auctionInformation.owner).to.be.equal(borrower);
            
            //const buyValue = await this.fantomLiquidationManager.getBuyValue(this.testToken.address, etherToWei(9999));
            //console.log('buyValue: ', weiToEther(buyValue));

            //const currentPrice = await this.fantomLiquidationManager.getCurrentPrice(borrower);
            //console.log('currentPrice: ', weiToEther(currentPrice));

            // get the value that bidder1 has to pay
            const debtValue = await this.fantomLiquidationManager.getDebtValue(borrower, this.testToken.address, etherToWei(9999));
            // console.log('debtValue: ', weiToEther(debtValue));

            // bidder1 approve the transfer of the neccessary amount by FantomLiquidationManager
            await this.fantomFUSD.approve(this.fantomLiquidationManager.address, debtValue, {from: bidder1});

            // const balance4 = await this.fantomLiquidationManager.fantomMintERC20Balance(this.testToken.address);
            console.log('balance4: ', weiToEther(balance4));
            expect(weiToEther(balance4)*1).to.be.equal(9999); 
            
            // bidder1 bids
            await this.fantomLiquidationManager.bidAuction(borrower, this.testToken.address, etherToWei(5000), {from: bidder1});

            // make sure FantomMint contract now has the collateral of 4999 because it has transferred 5000 to bidder
            const balance5 = await this.testToken.balanceOf(this.fantomMint.address);
            //console.log('balance5: ', weiToEther(balance5));
            expect(weiToEther(balance5)*1).to.be.equal(4999);
            const balance6 = await this.testToken.balanceOf(bidder1);
            //console.log('balance6: ', weiToEther(balance6));
            expect(weiToEther(balance6)*1).to.be.equal(5000);

            // the fUSD balance of bidder1 should be less than the initial amount
            const balance7 = await this.fantomFUSD.balanceOf(bidder1);
            //console.log('balance7: ', weiToEther(balance7));
            expect(weiToEther(balance7)*1).to.be.lessThan(500000);

            // make sure FantomLiquidation gets the correct amount of fUSDs from bidder
            const balance8 = await this.fantomFUSD.balanceOf(this.fantomLiquidationManager.address);
            //console.log('balance8: ', weiToEther(balance8));
            expect(weiToEther(balance8)*1).to.be.equal(2500);
                 
        }) */

     /*   it(`Scenario 3:
        borrower approves and deposits 9999 wFTM, 
        then ints possible max amount of fUSD,
        the price of wFTM changes from 1 to 0.5,
        the liquidation starts
        bidder1 bids the auction to get all 9999 wFTM
        but doesnt approve enough fUSD to FantomLiquidationManager
        thus the bid fails
        `,
            async function() {
            // mint 9999 wFTMs for borrower so he/she can borrow some fUSD
            await this.testToken.mint(borrower, etherToWei(9999));

            // mint bidder1 enough fUSD to bid for liquidated collateral
            await this.fantomFUSD.mint(bidder1, etherToWei(500000), {from: owner});
            //const bidder1fUSDBalance = await this.fantomFUSD.balanceOf(bidder1);
            //console.log('bidder1fUSDBalance: ', weiToEther(bidder1fUSDBalance));

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

            // set the debtValue-buyValue ratio to 1
            await this.fantomLiquidationManager.updateAuctionBeginPrice(10000, {from:owner});

            // liquidataion is started by the newly added admin
            await this.fantomLiquidationManager.startLiquidation(borrower, {from: admin});

            // make sure the borrow is the auction list
            const auctionInformation = await this.fantomLiquidationManager.auctionList(borrower);
            //console.log("auction owner: ", auctionInformation.owner);
            //console.log("auction start price: ", weiToEther(auctionInformation.startPrice));
            expect(auctionInformation.owner).to.be.equal(borrower);
            
            // const buyValue = await this.fantomLiquidationManager.getBuyValue(this.testToken.address, etherToWei(9999));
            // console.log('buyValue: ', weiToEther(buyValue));

            // const currentPrice = await this.fantomLiquidationManager.getCurrentPrice(borrower);
            // console.log('currentPrice: ', weiToEther(currentPrice));

            // get the value that bidder1 has to pay
            const debtValue = await this.fantomLiquidationManager.getDebtValue(borrower, this.testToken.address, etherToWei(9999));
            // console.log('debtValue: ', weiToEther(debtValue));

            // bidder1 approve some amount for transfer  by FantomLiquidationManager
            await this.fantomFUSD.approve(this.fantomLiquidationManager.address, etherToWei(100), {from: bidder1});

            // const balance4 = await this.fantomLiquidationManager.fantomMintERC20Balance(this.testToken.address);
            // console.log('balance4: ', weiToEther(balance4));
            // expect(weiToEther(balance4)*1).to.be.equal(9999);
            
            // bidder1 bids but will fail as he/she doesn't give enough fUSD allowance to FantomLiquidationManager to transfer the fUSD
            await expectRevert(this.fantomLiquidationManager.bidAuction(borrower, this.testToken.address, etherToWei(9999), {from: bidder1}), "insufficient fUSD allowance");

            // make sure FantomMint contract now no longer has the collateral and has transferred it to bidder
            const balance5 = await this.testToken.balanceOf(this.fantomMint.address);
            //console.log('balance5: ', weiToEther(balance5));
            expect(weiToEther(balance5)*1).to.be.equal(9999);
            const balance6 = await this.testToken.balanceOf(bidder1);
            //console.log('balance6: ', weiToEther(balance6));
            expect(weiToEther(balance6)*1).to.be.equal(0);

            // the fUSD balance of bidder1 should be less than the initial amount
            const balance7 = await this.fantomFUSD.balanceOf(bidder1);
            //console.log('balance7: ', weiToEther(balance7));
            expect(weiToEther(balance7)*1).to.be.equal(500000);

            // make sure FantomLiquidation gets the correct amount of fUSDs from bidder
            const balance8 = await this.fantomFUSD.balanceOf(this.fantomLiquidationManager.address);
            //console.log('balance8: ', weiToEther(balance8));
            expect(weiToEther(balance8)*1).to.be.equal(0);
                 
        }) */

      /*  it(`Scenario 4:
        borrower approves and deposits 9999 wFTM, 
        then ints possible max amount of fUSD,
        the price of wFTM changes from 1 to 1.5,
        the system tries the liquidation but it will fail with "Collateral is not eligible for liquidation"
        `,
            async function() {
            // mint 9999 wFTMs for borrower so he/she can borrow some fUSD
            await this.testToken.mint(borrower, etherToWei(9999));
            
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

            // assume: the value of wFTM has changed to 1.5 USD !!
            await this.testOraclePriceProxy.setPrice(this.testToken.address, etherToWei(1.5));

            // make sure it's live
            const live = await this.fantomLiquidationManager.live();
            //console.log('live: ', live);
            expect(live).to.be.equal(true);

            // owner adds another admin
            await this.fantomLiquidationManager.addAdmin(admin, {from:owner});
            const isAdmin = await this.fantomLiquidationManager.admins(admin);
            //console.log(isAdmin);
            expect(isAdmin).to.be.equal(true);

            // liquidataion is started by the newly added admin but it will be reverted
            await expectRevert(this.fantomLiquidationManager.startLiquidation(borrower, {from: admin}),"Collateral is not eligible for liquidation");

        }) */

      /*  it(`Scenario 5:
        borrower approves and deposits 9999 wFTM, 
        then ints possible max amount of fUSD,
        the price of wFTM changes from 1 to 0.5,
        the system starts the liquidation
        bidder1 and bidder2 buy the collateral by 1/3 and 2/3
        `,
            async function() {
            
            // mint 9999 wFTMs for borrower so he/she can borrow some fUSD
            await this.testToken.mint(borrower, etherToWei(9999));
            
            // mint bidder1 and bidder2 enough fUSD to bid for liquidated collateral
            await this.fantomFUSD.mint(bidder1, etherToWei(500000), {from: owner});
            await this.fantomFUSD.mint(bidder2, etherToWei(500000), {from: owner});
            //const bidder1fUSDBalance = await this.fantomFUSD.balanceOf(bidder1);
            //console.log('bidder1fUSDBalance: ', weiToEther(bidder1fUSDBalance));

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

            // set the debtValue-buyValue ratio to 1
            await this.fantomLiquidationManager.updateAuctionBeginPrice(10000, {from:owner});

            // liquidataion is started by the newly added admin
            await this.fantomLiquidationManager.startLiquidation(borrower, {from: admin});

            // make sure the borrow is the auction list
            const auctionInformation = await this.fantomLiquidationManager.auctionList(borrower);
            //console.log("auction owner: ", auctionInformation.owner);
            //console.log("auction start price: ", weiToEther(auctionInformation.startPrice));
            expect(auctionInformation.owner).to.be.equal(borrower);

            // get the value of the collateral
            const debtValue = await this.fantomLiquidationManager.getDebtValue(borrower, this.testToken.address, etherToWei(9999));
            //console.log('debtValue: ', weiToEther(debtValue));            
 
             // bidder1, bidder2 approve the transfer of the neccessary amount by FantomLiquidationManager
             const bidder1BuyAmount = weiToEther(debtValue)/3;
             //console.log('bidder1BuyAmount', bidder1BuyAmount);
             //await this.fantomFUSD.approve(this.fantomLiquidationManager.address, etherToWei(bidder1BuyAmount), {from: bidder1});
             await this.fantomFUSD.approve(this.fantomLiquidationManager.address, etherToWei(bidder1BuyAmount+0.001), {from: bidder1});
             const bidder2BuyAmount = weiToEther(debtValue)*2/3;
             //console.log('bidder2BuyAmount', bidder2BuyAmount);
             //await this.fantomFUSD.approve(this.fantomLiquidationManager.address, etherToWei(bidder2BuyAmount), {from: bidder2});
             await this.fantomFUSD.approve(this.fantomLiquidationManager.address, etherToWei(bidder2BuyAmount+0.001), {from: bidder2});

            // bidder1 bidder2 bids
            await this.fantomLiquidationManager.bidAuction(borrower, this.testToken.address, etherToWei(3333), {from: bidder1});
            await this.fantomLiquidationManager.bidAuction(borrower, this.testToken.address, etherToWei(6666), {from: bidder2});

            // make sure FantomMint contract now no longer has the the collateral and has transferred it to bidder 1 and bidder2
            const balance4 = await this.testToken.balanceOf(this.fantomMint.address);
            //console.log('balance4: ', weiToEther(balance4));
            expect(weiToEther(balance4)*1).to.be.equal(0);

            const balance5 = await this.testToken.balanceOf(bidder1);
            //console.log('balance5: ', weiToEther(balance5));
            expect(weiToEther(balance5)*1).to.be.equal(3333);

            const balance6 = await this.testToken.balanceOf(bidder2);
            //console.log('balance6: ', weiToEther(balance6));
            expect(weiToEther(balance6)*1).to.be.equal(6666);
        }) */

      /*  it(`Scenario 6:
        borrower approves and deposits 9999 wFTM, 
        then ints possible max amount of fUSD,
        the price of wFTM changes from 1 to 0.5,
        the liquidation starts,
        check the debt value,
        nobody bids until 3 hours later,
        check the debt value after 3 hours
        `,
            async function() {
            // mint 9999 wFTMs for borrower so he/she can borrow some fUSD
            await this.testToken.mint(borrower, etherToWei(9999));

            // borrower needs to approve his/her wFTM transfer by FantomMint contract
            await this.testToken.approve(this.fantomMint.address, etherToWei(9999), {from: borrower});

            // borrower deposits all his/her 9999 wFTM
            await this.fantomMint.mustDeposit(this.testToken.address, etherToWei(9999), {from: borrower});
            const balance1 = await this.testToken.balanceOf(borrower);

            // mint maximum amount possible of fUSD for borrower
            await this.fantomMint.mustMintMax(this.fantomFUSD.address, 32000, {from: borrower});
            const fUSDBalance = await this.fantomFUSD.balanceOf(borrower);

            // assume: the value of wFTM has changed to 0.5 USD !!
            await this.testOraclePriceProxy.setPrice(this.testToken.address, etherToWei(0.5));

             // owner adds another admin
             await this.fantomLiquidationManager.addAdmin(admin, {from:owner});
             const isAdmin = await this.fantomLiquidationManager.admins(admin);
            
            // liquidataion is started by the newly added admin
            await this.fantomLiquidationManager.startLiquidation(borrower, {from: admin});
            
            // get the value of the collateral            
            const debtValue = await this.fantomLiquidationManager.getDebtValue(borrower, this.testToken.address, etherToWei(9999));
            //console.log('debtValue: ', weiToEther(debtValue));

            //get the value of the collateral 3 hours later  
            await time.increase(3*60*60);
            const debtValue2 = await this.fantomLiquidationManager.getDebtValue(borrower, this.testToken.address, etherToWei(9999));
            //console.log('debtValue: ', weiToEther(debtValue2));
            expect(weiToEther(debtValue2)*1).to.be.lessThan(weiToEther(debtValue)*1)
                
        }) */

       /* it(`Scenario 7:
        borrower approves and deposits 9999 wFTM, 
        then mints possible max amount of fUSD,
        the price of wFTM changes from 1 to 0.5,
        the liquidation starts,
        the same liquidation starts again but it will fail with ""
        `,
            async function() {
            // mint 9999 wFTMs for borrower so he/she can borrow some fUSD
            await this.testToken.mint(borrower, etherToWei(9999));

            // borrower needs to approve his/her wFTM transfer by FantomMint contract
            await this.testToken.approve(this.fantomMint.address, etherToWei(9999), {from: borrower});

            // borrower deposits all his/her 9999 wFTM
            await this.fantomMint.mustDeposit(this.testToken.address, etherToWei(9999), {from: borrower});
            const balance1 = await this.testToken.balanceOf(borrower);

            // mint maximum amount possible of fUSD for borrower
            await this.fantomMint.mustMintMax(this.fantomFUSD.address, 32000, {from: borrower});
            const fUSDBalance = await this.fantomFUSD.balanceOf(borrower);

            // assume: the value of wFTM has changed to 0.5 USD !!
            await this.testOraclePriceProxy.setPrice(this.testToken.address, etherToWei(0.5));

             // owner adds another admin
             await this.fantomLiquidationManager.addAdmin(admin, {from:owner});
             const isAdmin = await this.fantomLiquidationManager.admins(admin);
            
            // liquidataion is started by the newly added admin
            await this.fantomLiquidationManager.startLiquidation(borrower, {from: admin});
            
            // liquidataion is started again but it will fail with ""
            await expectRevert(this.fantomLiquidationManager.startLiquidation(borrower, {from: admin}),"Collateral is not eligible for liquidation");
            
        }) */

       /* it(`Scenario 8:
        borrower approves and deposits 6666 wFTM and 3333 wFTM2,
        then mints possible max amount of fUSD,
        the price of wFTM and wFTM2 changes from 1 to 0.5 and 0.6 respectively,
        the liquidation starts,
        bidder1 one buys 6666 wFTM, bidder2 buys 3333 wFTM2       
        `,
            async function() {
            // mint 6666 wFTMs for borrower so he/she can borrow some fUSD
            await this.testToken.mint(borrower, etherToWei(6666));

            this.testToken2 = await TestToken.new({from:owner});
            await this.testToken2.initialize("wFTM2", "wFTM2", 18);
            await this.testOraclePriceProxy.setPrice(this.testToken2.address, etherToWei(1));
            await this.fantomMintTokenRegistry.addToken(this.testToken2.address, "", this.testOraclePriceProxy.address, 18, true, true, false);

            // mint 3333 wFTM2s for borrower so he/she can borrow some fUSD
            await this.testToken2.mint(borrower, etherToWei(3333));

            // mint bidder1 and bidder2 enough fUSD to bid for liquidated collateral
            await this.fantomFUSD.mint(bidder1, etherToWei(500000), {from: owner});
            await this.fantomFUSD.mint(bidder2, etherToWei(500000), {from: owner});

            // borrower needs to approve his/her wFTM transfer by FantomMint contract
            await this.testToken.approve(this.fantomMint.address, etherToWei(6666), {from: borrower});
            await this.testToken2.approve(this.fantomMint.address, etherToWei(3333), {from: borrower});

            // borrower deposits all his/her 6666 wFTM and 3333 wFTM2
            await this.fantomMint.mustDeposit(this.testToken.address, etherToWei(6666), {from: borrower});
            await this.fantomMint.mustDeposit(this.testToken2.address, etherToWei(3333), {from: borrower});

            // check the mint maximum amount possible of fUSD for borrower
            const maxToMint = await this.fantomMint.maxToMint(borrower, this.fantomFUSD.address, 32000);
            console.log('maxToMint in ether: ', weiToEther(maxToMint));
            expect(maxToMint).to.be.bignumber.greaterThan('0');
            expect(weiToEther(maxToMint)*1).to.be.lessThanOrEqual(3333);

            // mint maximum amount possible of fUSD for borrower
            await this.fantomMint.mustMintMax(this.fantomFUSD.address, 32000, {from: borrower});
            const fUSDBalance = await this.fantomFUSD.balanceOf(borrower);
            //console.log('fUSD balance: ', weiToEther(fUSDBalance));
            expect(fUSDBalance).to.be.bignumber.greaterThan('0');
            expect(weiToEther(fUSDBalance)*1).to.be.lessThanOrEqual(weiToEther(maxToMint)*1);

            // assume: the value of wFTM and wFTM2 has changed to 0.5 USD and 0.6 USD respectively !!
            await this.testOraclePriceProxy.setPrice(this.testToken.address, etherToWei(0.5));
            await this.testOraclePriceProxy.setPrice(this.testToken2.address, etherToWei(0.6));

            // owner adds another admin
            await this.fantomLiquidationManager.addAdmin(admin, {from:owner});
            const isAdmin = await this.fantomLiquidationManager.admins(admin);
            //console.log(isAdmin);
            expect(isAdmin).to.be.equal(true);

            // set the debtValue-buyValue ratio to 1
            await this.fantomLiquidationManager.updateAuctionBeginPrice(10000, {from:owner});

            // liquidataion is started by the newly added admin
            await this.fantomLiquidationManager.startLiquidation(borrower, {from: admin});

            // make sure the borrow is the auction list
            const auctionInformation = await this.fantomLiquidationManager.auctionList(borrower);
            //console.log("auction owner: ", auctionInformation.owner);
            //console.log("auction start price: ", weiToEther(auctionInformation.startPrice));
            expect(auctionInformation.owner).to.be.equal(borrower);

            // get the value of the collateral
            const debtValue1 = await this.fantomLiquidationManager.getDebtValue(borrower, this.testToken.address, etherToWei(9999));
            console.log('debtValue1: ', weiToEther(debtValue1));

            const debtValue2 = await this.fantomLiquidationManager.getDebtValue(borrower, this.testToken2.address, etherToWei(9999));
            console.log('debtValue2: ', weiToEther(debtValue2));

            }) */

    })  
})