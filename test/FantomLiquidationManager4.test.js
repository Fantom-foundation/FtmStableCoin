//npx hardhat test .\test\FantomLiquidationManager.test.js --network localhost
// or truffle test .\test\FantomLiquidationManager.test.js --network ganache
const {
  BN,
  constants,
  expectEvent,
  expectRevert,
  time,
} = require('@openzeppelin/test-helpers');
const { ZERO_ADDRESS } = constants;

const { expect } = require('chai');

const FantomLiquidationManager = artifacts.require(
  'MockFantomLiquidationManager'
);
const FantomMintTokenRegistry = artifacts.require('FantomMintTokenRegistry');
const FantomDeFiTokenStorage = artifacts.require('FantomDeFiTokenStorage');
const FantomMint = artifacts.require('FantomMint');
const FantomMintAddressProvider = artifacts.require(
  'FantomMintAddressProvider'
);
const FantomMintRewardDistribution = artifacts.require(
  'MockFantomMintRewardDistribution'
);
const FantomFUSD = artifacts.require('FantomFUSD');
const MockToken = artifacts.require('MockToken');
const MockPriceOracleProxy = artifacts.require('MockPriceOracleProxy');
const MockStartLiquidation = artifacts.require('MockStartLiquidation');

const weiToEther = (n) => {
  return web3.utils.fromWei(n.toString(), 'ether');
};

const etherToWei = (n) => {
  return new web3.utils.BN(web3.utils.toWei(n.toString(), 'ether'));
};

contract('Unit Test for FantomLiquidationManager', function([
  owner,
  admin,
  borrower,
  bidder1,
  bidder2,
  fantomFeeVault,
]) {
  beforeEach(async function() {
    /** all the necessary setup  */
    this.fantomMintAddressProvider = await FantomMintAddressProvider.new({
      from: owner,
    });
    await this.fantomMintAddressProvider.initialize(owner);

    this.fantomLiquidationManager = await FantomLiquidationManager.new({
      from: owner,
    });
    await this.fantomLiquidationManager.initialize(
      owner,
      this.fantomMintAddressProvider.address
    );

    this.mockStartLiquidation = await MockStartLiquidation.new({ from: owner });

    this.fantomMint = await FantomMint.new({ form: owner });
    await this.fantomMint.initialize(
      owner,
      this.fantomMintAddressProvider.address
    );

    this.fantomMintTokenRegistry = await FantomMintTokenRegistry.new();
    await this.fantomMintTokenRegistry.initialize(owner);

    this.collateralPool = await FantomDeFiTokenStorage.new({ from: owner });
    await this.collateralPool.initialize(
      this.fantomMintAddressProvider.address,
      true
    );

    this.debtPool = await FantomDeFiTokenStorage.new({ from: owner });
    await this.debtPool.initialize(
      this.fantomMintAddressProvider.address,
      true
    );

    this.fantomFUSD = await FantomFUSD.new({ from: owner });
    await this.fantomFUSD.initialize(owner);

    this.fantomMintRewardDistribution = await FantomMintRewardDistribution.new({
      from: owner,
    });
    await this.fantomMintRewardDistribution.initialize(
      owner,
      this.fantomMintAddressProvider.address
    );

    this.mockToken = await MockToken.new({ from: owner });
    await this.mockToken.initialize('wFTM', 'wFTM', 18);

    this.mockToken2 = await MockToken.new({ from: owner });
    await this.mockToken2.initialize('wFTM2', 'wFTM2', 18);

    this.mockPriceOracleProxy = await MockPriceOracleProxy.new({ from: owner });

    await this.fantomMintAddressProvider.setFantomMint(
      this.fantomMint.address,
      { from: owner }
    );
    await this.fantomMintAddressProvider.setCollateralPool(
      this.collateralPool.address,
      { from: owner }
    );
    await this.fantomMintAddressProvider.setDebtPool(this.debtPool.address, {
      from: owner,
    });
    await this.fantomMintAddressProvider.setTokenRegistry(
      this.fantomMintTokenRegistry.address,
      { from: owner }
    );
    await this.fantomMintAddressProvider.setRewardDistribution(
      this.fantomMintRewardDistribution.address,
      { from: owner }
    );
    await this.fantomMintAddressProvider.setPriceOracleProxy(
      this.mockPriceOracleProxy.address,
      { from: owner }
    );
    await this.fantomMintAddressProvider.setFantomLiquidationManager(
      this.fantomLiquidationManager.address,
      { from: owner }
    );

    // set the initial value; 1 wFTM = 1 USD; 1 wFTM2 = 1 USD; 1 fUSD = 1 USD
    await this.mockPriceOracleProxy.setPrice(
      this.mockToken.address,
      etherToWei(1)
    );
    await this.mockPriceOracleProxy.setPrice(
      this.mockToken2.address,
      etherToWei(1)
    );
    await this.mockPriceOracleProxy.setPrice(
      this.fantomFUSD.address,
      etherToWei(1)
    );

    await this.fantomMintTokenRegistry.addToken(
      this.mockToken.address,
      '',
      this.mockPriceOracleProxy.address,
      18,
      true,
      true,
      false
    );
    await this.fantomMintTokenRegistry.addToken(
      this.mockToken2.address,
      '',
      this.mockPriceOracleProxy.address,
      18,
      true,
      true,
      false
    );
    await this.fantomMintTokenRegistry.addToken(
      this.fantomFUSD.address,
      '',
      this.mockPriceOracleProxy.address,
      18,
      true,
      false,
      true
    );

    await this.fantomFUSD.addMinter(this.fantomMint.address, { from: owner });

    await this.fantomLiquidationManager.updateFantomMintContractAddress(
      this.fantomMint.address,
      { from: owner }
    );
    await this.fantomLiquidationManager.updateFantomUSDAddress(
      this.fantomFUSD.address
    );

    await this.fantomLiquidationManager.addAdmin(admin, { from: owner });

    await this.fantomLiquidationManager.updateFantomFeeVault(fantomFeeVault, {
      from: owner,
    });

    await this.fantomLiquidationManager.updateInitiatorBonus(etherToWei(0.5));

    /** all the necesary setup */
  });

  describe('depositing collateral and minting fUSD', function() {
    it('Scenario 10', async function() {
      console.log(`
            Scenario 10:
            Borrower approves and deposits 9999 wFTM, 
            Then mints possible max amount of fUSD,
            The price of the wFTM changes from 1 to 0.5,
            A smart contract tries to start the liquidation 
            but it will fail with "Smart Contract not allowed"`);

      console.log('');
      console.log(`
            Mint 9999 wFTMs for the borrower so he/she can borrow some fUSD`);
      await this.mockToken.mint(borrower, etherToWei(9999));

      console.log(`
            Mint bidder1 10000 fUSDs to bid for the liquidated collateral`);
      await this.fantomFUSD.mint(bidder1, etherToWei(10000), { from: owner });

      console.log(`
            Borrower approves 9999 wFTM to FantomMint contract`);
      await this.mockToken.approve(this.fantomMint.address, etherToWei(9999), {
        from: borrower,
      });

      console.log(`
            Borrower deposits all his/her 9999 wFTMs`);
      await this.fantomMint.mustDeposit(
        this.mockToken.address,
        etherToWei(9999),
        { from: borrower }
      );

      console.log(`
            *Now the borrower should have 0 wFTM`);
      let balance = await this.mockToken.balanceOf(borrower);
      expect(balance).to.be.bignumber.equal('0');

      console.log(`
            Mint the maximum amount of fUSD for the borrower`);
      await this.fantomMint.mustMintMax(this.fantomFUSD.address, 32000, {
        from: borrower,
      });
      console.log(`
            *Now borrower should have fUSD between 0 and 3333`);
      let amount = await this.fantomFUSD.balanceOf(borrower);
      expect(amount).to.be.bignumber.greaterThan('0');
      expect(weiToEther(amount) * 1).to.be.lessThanOrEqual(3333);
      console.log(
        `
            The actual amount of fUSD minted: `,
        weiToEther(amount)
      );

      console.log(`
            Let's set the price of wFTM to 0.5 USD`);
      await this.mockPriceOracleProxy.setPrice(
        this.mockToken.address,
        etherToWei(0.5)
      );

      console.log(`
            *A smart contract tries to start the liquidation 
            but it fail with "Smart Contract not allowed"`);

      await expectRevert(
        this.mockStartLiquidation.startLiquidation(
          this.fantomLiquidationManager.address,
          borrower
        ),
        'Smart Contract not allowed'
      );
    });

    it('Scenario 11', async function() {
      console.log(`
            Scenario 11:
            Borrower approves and deposits 9999 wFTM, 
            Then mints possible max amount of fUSD,
            The price of the wFTM changes from 1 to 0.5,
            The borrower himself starts the liquidation
            The borrower himself approve 5000 fUSDs and bids the auction to get all 9999 wFTMs back`);

      console.log('');
      console.log(`
            Mint 9999 wFTMs for the borrower so he/she can borrow some fUSD`);
      await this.mockToken.mint(borrower, etherToWei(9999));

      console.log(`
            Borrower approves 9999 wFTM to FantomMint contract`);
      await this.mockToken.approve(this.fantomMint.address, etherToWei(9999), {
        from: borrower,
      });

      console.log(`
            Borrower deposits all his/her 9999 wFTMs`);
      await this.fantomMint.mustDeposit(
        this.mockToken.address,
        etherToWei(9999),
        { from: borrower }
      );

      console.log(`
            *Now the borrower should have 0 wFTM`);
      let balance = await this.mockToken.balanceOf(borrower);
      expect(balance).to.be.bignumber.equal('0');

      console.log(`
            Mint the maximum amount of fUSD for the borrower`);
      await this.fantomMint.mustMintMax(this.fantomFUSD.address, 32000, {
        from: borrower,
      });
      console.log(`
            *Now borrower should have fUSD between 0 and 3333`);
      let amount = await this.fantomFUSD.balanceOf(borrower);
      expect(amount).to.be.bignumber.greaterThan('0');
      expect(weiToEther(amount) * 1).to.be.lessThanOrEqual(3333);
      console.log(
        `
            The actual amount of fUSD minted: `,
        weiToEther(amount)
      );

      console.log(`
            Let's set the price of wFTM to 0.5 USD`);
      await this.mockPriceOracleProxy.setPrice(
        this.mockToken.address,
        etherToWei(0.5)
      );

      console.log(`
            Borrower himself starts the liquidation`);

      let result = await this.fantomLiquidationManager.startLiquidation(
        borrower,
        { from: borrower }
      );

      console.log(`
            *Event AuctionStarted should be emitted with correct values: nonce = 1, user = borrower`);
      expectEvent(result, 'AuctionStarted', {
        nonce: new BN('1'),
        user: borrower,
      });

      console.log(`
            Mint borrower another 2000 fUSDs for free so he has enough fUSD to bid for the liquidated collateral`);
      await this.fantomFUSD.mint(borrower, etherToWei(2000), { from: owner });

      console.log(`
            Borrower approves FantomLiquidationManager to spend 5000 fUSD to buy the collateral`);
      await this.fantomFUSD.approve(
        this.fantomLiquidationManager.address,
        etherToWei(5000),
        { from: borrower }
      );

      balance = await this.fantomFUSD.balanceOf(borrower);
      console.log(`
            The amount of fUSD that borrower 
            has before bidding his own collateral: ${weiToEther(balance)}`);

      console.log(`
            Borrower bids all the collateral`);

      await this.fantomLiquidationManager.bidAuction(1, new BN('100000000'), {
        from: borrower,
        value: etherToWei(0.5),
      });

      console.log(`
            Let's check the amount of wFTM that borrower has after he bids his own collateral`);
      balance = await this.mockToken.balanceOf(borrower);

      console.log(`
            The amount of wFTM that borrower has now: ${weiToEther(balance)}`);

      balance = await this.fantomFUSD.balanceOf(borrower);
      console.log(`
            The amount of fUSD that borrower 
            has after bidding his own collateral: ${weiToEther(balance)}`);
    });

    it('Scenario 12', async function() {
      console.log(`
            Scenario 12:
            Borrower approves and deposits 9999 wFTM, 
            Then mints possible max amount of fUSD,
            The price of the wFTM changes from 1 to 0.5,
            The borrower himself starts the liquidation
            After 22.2 hours the borrower himself approves 5000 fUSDs and bids the auction 
            to get all 9999 wFTMs back`);

      console.log('');
      console.log(`
            Mint 9999 wFTMs for the borrower so he/she can borrow some fUSD`);
      await this.mockToken.mint(borrower, etherToWei(9999));

      console.log(`
            Borrower approves 9999 wFTM to FantomMint contract`);
      await this.mockToken.approve(this.fantomMint.address, etherToWei(9999), {
        from: borrower,
      });

      console.log(`
            Borrower deposits all his/her 9999 wFTMs`);
      await this.fantomMint.mustDeposit(
        this.mockToken.address,
        etherToWei(9999),
        { from: borrower }
      );

      console.log(`
            *Now the borrower should have 0 wFTM`);
      let balance = await this.mockToken.balanceOf(borrower);
      expect(balance).to.be.bignumber.equal('0');

      console.log(`
            Mint the maximum amount of fUSD for the borrower`);
      await this.fantomMint.mustMintMax(this.fantomFUSD.address, 32000, {
        from: borrower,
      });
      console.log(`
            *Now borrower should have fUSD between 0 and 3333`);
      let amount = await this.fantomFUSD.balanceOf(borrower);
      expect(amount).to.be.bignumber.greaterThan('0');
      expect(weiToEther(amount) * 1).to.be.lessThanOrEqual(3333);
      console.log(
        `
            The actual amount of fUSD minted: `,
        weiToEther(amount)
      );

      console.log(`
            Let's set the price of wFTM to 0.5 USD`);
      await this.mockPriceOracleProxy.setPrice(
        this.mockToken.address,
        etherToWei(0.5)
      );

      console.log(`
            Borrower himself starts the liquidation`);

      let result = await this.fantomLiquidationManager.startLiquidation(
        borrower,
        { from: borrower }
      );

      console.log(`
            *Event AuctionStarted should be emitted with correct values: nonce = 1, user = borrower`);
      expectEvent(result, 'AuctionStarted', {
        nonce: new BN('1'),
        user: borrower,
      });

      console.log(`
            Mint borrower another 2000 fUSDs for free so he has enough fUSD to bid for the liquidated collateral`);
      await this.fantomFUSD.mint(borrower, etherToWei(2000), { from: owner });

      console.log(`
            Borrower approves FantomLiquidationManager to spend 5000 fUSD to buy the collateral`);
      await this.fantomFUSD.approve(
        this.fantomLiquidationManager.address,
        etherToWei(5000),
        { from: borrower }
      );

      balance = await this.fantomFUSD.balanceOf(borrower);
      console.log(`
            The amount of fUSD that borrower 
            has before bidding his own collateral: ${weiToEther(balance)}`);

      console.log(`
            Fast forward 22.2 hours`);
      await this.fantomLiquidationManager.increaseTime(22.2 * 60 * 60);

      console.log(`
            Borrower bids all the collateral`);

      await this.fantomLiquidationManager.bidAuction(1, new BN('100000000'), {
        from: borrower,
        value: etherToWei(0.5),
      });

      console.log(`
            Let's check the amount of wFTM that borrower has after he bids his own collateral`);
      balance = await this.mockToken.balanceOf(borrower);

      console.log(`
            The amount of wFTM that borrower has now: ${weiToEther(balance)}`);

      balance = await this.fantomFUSD.balanceOf(borrower);
      console.log(`
            The amount of fUSD that borrower 
            has after bidding his own collateral: ${weiToEther(balance)}`);
    });

    it('Scenario 13', async function() {
      console.log(`
            Scenario 13:
            Borrower approves and deposits 9999 wFTM, 
            Then mints possible 1000,
            He/She should get some rewards as the collateral is more than 500%`);

      console.log(`
            Set the reward token, reward rate etc`);
      this.rewardToken = await MockToken.new({ from: owner });
      await this.rewardToken.initialize('rFTM', 'rFTM', 18);
      await this.fantomMintAddressProvider.setRewardToken(
        this.rewardToken.address
      );
      await this.mockPriceOracleProxy.setPrice(
        this.rewardToken.address,
        etherToWei(0.05)
      );
      await this.fantomMintRewardDistribution.rewardUpdateRate(10);

      console.log(`
            Mint 9999 wFTMs for the borrower so he/she can borrow some fUSD`);
      await this.mockToken.mint(borrower, etherToWei(9999));

      console.log(`
            Borrower approves 9999 wFTM to FantomMint contract`);
      await this.mockToken.approve(this.fantomMint.address, etherToWei(9999), {
        from: borrower,
      });

      console.log(`
            Borrower deposits all his/her 9999 wFTMs`);
      await this.fantomMint.mustDeposit(
        this.mockToken.address,
        etherToWei(9999),
        { from: borrower }
      );

      console.log(`
            *Now the borrower should have 0 wFTM`);
      let balance = await this.mockToken.balanceOf(borrower);
      expect(balance).to.be.bignumber.equal('0');

      console.log(`
            Borrower mints 1000 fUSDs`);
      let result = await this.fantomMint.mustMint(
        this.fantomFUSD.address,
        etherToWei(1000),
        { from: borrower }
      );

      let rewardIsEligible = await this.fantomMintRewardDistribution.rewardIsEligible(
        borrower
      );
      console.log(`rewardIsEligible: ${rewardIsEligible}`);

      let rewardCanClaim = await this.fantomMintRewardDistribution.rewardCanClaim(
        borrower
      );
      console.log(`rewardCanClaim: ${rewardCanClaim}`);

      //await this.fantomMintRewardDistribution.mustRewardClaim({
      //  from: borrower,
      //});

      await this.fantomMintRewardDistribution.rewardPush();
      let rewardRate = await this.fantomMintRewardDistribution.rewardRate();
      let rewardPerToken = await this.fantomMintRewardDistribution.rewardPerToken();
      let rewardEarned = await this.fantomMintRewardDistribution.rewardEarned(
        borrower
      );

      console.log(`rewardRate: ${rewardRate.toString()}`);
      console.log(`rewardPerToken: ${rewardPerToken.toString()}`);
      console.log(`rewardEarned: ${rewardEarned.toString()}`);

      await this.fantomMintRewardDistribution.increaseTime(86400);
      //await this.fantomMintRewardDistribution.mustRewardPush();

      await this.fantomMintRewardDistribution.rewardPush();
      rewardRate = await this.fantomMintRewardDistribution.rewardRate();
      rewardPerToken = await this.fantomMintRewardDistribution.rewardPerToken();
      rewardEarned = await this.fantomMintRewardDistribution.rewardEarned(
        borrower
      );

      console.log(`rewardRate: ${rewardRate.toString()}`);
      console.log(`rewardPerToken: ${rewardPerToken.toString()}`);
      console.log(`rewardEarned: ${rewardEarned.toString()}`);

      //await this.fantomMintRewardDistribution.mustRewardClaim({
      //  from: borrower,
      //});
    });
  });
});
