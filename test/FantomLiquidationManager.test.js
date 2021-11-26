//npx hardhat test .\test\FantomLiquidationManager.test.js --network localhost
// or truffle test .\test\FantomLiquidationManager.test.js --network ganache
const {
  BN,
  constants,
  expectEvent,
  expectRevert,
  time
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
  'FantomMintRewardDistribution'
);
const FantomFUSD = artifacts.require('FantomFUSD');
const MockToken = artifacts.require('MockToken');
const MockPriceOracleProxy = artifacts.require('MockPriceOracleProxy');

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
  liquidationStarter
]) {
  beforeEach(async function() {
    /** all the necessary setup  */
    this.fantomMintAddressProvider = await FantomMintAddressProvider.new({
      from: owner
    });
    await this.fantomMintAddressProvider.initialize(owner);

    this.fantomLiquidationManager = await FantomLiquidationManager.new({
      from: owner
    });
    await this.fantomLiquidationManager.initialize(
      owner,
      this.fantomMintAddressProvider.address
    );

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
    //await this.fantomFUSD.initialize(owner);
    await this.fantomFUSD.init(owner);

    this.fantomMintRewardDistribution = await FantomMintRewardDistribution.new({
      from: owner
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
      from: owner
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
      from: owner
    });

    await this.fantomLiquidationManager.updateInitiatorBonus(etherToWei(0.5));

    /** all the necesary setup */
  });

  describe('depositing collateral and minting fUSD', function() {
    it('Scenario 1', async function() {
      console.log(`
            Scenario 1:
            Borrower approves and deposits 9999 wFTM, 
            Then mints possible max amount of fUSD,
            The price of the wFTM changes from 1 to 0.5,
            The liquidation starts
            Bidder1 approve 5000 fUSDs and bids the auction to get all 9999 wFTM`);

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
        from: borrower
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
        from: borrower
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
            Somebody starts the liquidation`);

      let result = await this.fantomLiquidationManager.startLiquidation(
        borrower,
        { from: liquidationStarter }
      );

      console.log(`
            *Event AuctionStarted should be emitted with correct values: nonce = 1, user = borrower`);
      expectEvent(result, 'AuctionStarted', {
        nonce: new BN('1'),
        user: borrower
      });

      console.log(`
            Bidder1 approves FantomLiquidationManager to spend 5000 fUSD to buy the collateral`);
      await this.fantomFUSD.approve(
        this.fantomLiquidationManager.address,
        etherToWei(5000),
        { from: bidder1 }
      );

      let totalSupply = await this.fantomFUSD.totalSupply();
      console.log(`
            The total supply of FUSD before bidder1 bids: ${weiToEther(
              totalSupply
            )}`);

      console.log(`
            Bidder1 bids all the collateral`);
      console.log(`
            Let's check bidder1's FTM balance before bidding`);
      let balance1 = await web3.eth.getBalance(bidder1);
      console.log(`
            FTM balance of bidder1 before bidding: ${weiToEther(balance1)}`);

      console.log(`
            Let's check the initiator's FTM balance before bidding`);
      let balance2 = await web3.eth.getBalance(liquidationStarter);
      console.log(`
            FTM balance of initiator before bidding: ${weiToEther(balance2)}`);

      await this.fantomLiquidationManager.bidAuction(1, new BN('100000000'), {
        from: bidder1,
        value: etherToWei(0.5)
      });

      console.log(`
            Let's check bidder1's FTM balance after bidding`);
      let balance3 = await web3.eth.getBalance(bidder1);
      console.log(`
            FTM balance of bidder1 after bidding: ${weiToEther(balance3)}`);

      console.log(`
            Let's check the initiator's FTM balance after bidding`);
      let balance4 = await web3.eth.getBalance(liquidationStarter);
      console.log(`
            FTM balance of initiator after bidding: ${weiToEther(balance4)}`);

      console.log(`
            *Bidder1 should have 0.5 FTM less now`);
      expect(
        (weiToEther(balance3) * 1).toFixed(2) -
          (weiToEther(balance1) * 1).toFixed(2)
      ).to.be.equal(-0.5);

      console.log(`
          *Initiator should have 0.5 FTM more now`);
      expect(
        (weiToEther(balance4) * 1).toFixed(2) -
          (weiToEther(balance2) * 1).toFixed(2)
      ).to.be.equal(0.5);

      console.log(`
            *Bidder1's fUSD balance should be less than 10000`);
      balance = await this.fantomFUSD.balanceOf(bidder1);
      expect(weiToEther(balance) * 1).to.be.lessThan(10000);

      console.log(`
            The actual balance of bidder1's fUSD now: ${weiToEther(balance)}`);

      console.log(`
            The amount of fUSD that bidder1 has spent is 10000 minus ${weiToEther(
              balance
            )}`);
      balance2 = 10000 - weiToEther(balance);

      console.log(`
            The actual amount of fUSD that bidder1 has spent is ${balance2}`);

      console.log(`
            Check the amount of wFTM that bidder1 receives`);
      balance = await this.mockToken.balanceOf(bidder1);

      console.log(`
            The amount of wFTM that bidder1 receives: ${weiToEther(balance)}`);

      console.log(`
            Check the amount of wFTM that borrower is refunded`);
      balance2 = await this.mockToken.balanceOf(borrower);

      console.log(`
            The amount of wFTM that borrower is refunded: ${weiToEther(
              balance2
            )}`);

      console.log(`
            *The actual wFTM balance of bidder1 and the borrower should be 9999`);
      expect(weiToEther(balance) * 1 + weiToEther(balance2) * 1).to.be.equal(
        9999
      );

      totalSupply = await this.fantomFUSD.totalSupply();
      console.log(`
            The total supply of FUSD after bidder1 bids: ${weiToEther(
              totalSupply
            )}`);
    });

    it('Scenario 2', async function() {
      console.log(`
            Scenario 2:
            Borrower approves and deposits 9999 wFTM 
            Then mints possible max amount of fUSD
            The price of the wFTM changes from 1 to 0.5
            The liquidation starts
            Bidder1 approves 2500 fUSDs and bids the auction to get 4999.5 wFTM`);

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
        from: borrower
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
        from: borrower
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
            An admin starts the liquidation`);
      let result = await this.fantomLiquidationManager.startLiquidation(
        borrower,
        { from: admin }
      );

      console.log(`
            *Event AuctionStarted should be emitted with correct values: nonce = 1, user = borrower`);
      expectEvent(result, 'AuctionStarted', {
        nonce: new BN('1'),
        user: borrower
      });

      console.log(`
            Bidder1 approves FantomLiquidationManager to spend 2500 fUSD to buy the collateral`);
      await this.fantomFUSD.approve(
        this.fantomLiquidationManager.address,
        etherToWei(2500),
        { from: bidder1 }
      );

      console.log(`
            Bidder1 bids  the collateral`);
      await this.fantomLiquidationManager.bidAuction(1, new BN('50000000'), {
        from: bidder1,
        value: etherToWei(0.5)
      });

      console.log(`
            *Bidder1's fUSD balance should be less than 10000`);
      balance = await this.fantomFUSD.balanceOf(bidder1);
      expect(weiToEther(balance) * 1).to.be.lessThan(10000);

      console.log(`
            The actual balance of bidder1's fUSD now: ${weiToEther(balance)}`);

      console.log(`
            The amount of fUSD that bidder1 has spent is 10000 minus ${weiToEther(
              balance
            )}`);
      let balance2 = 10000 - weiToEther(balance);

      console.log(`
            The actual amount of fUSD that bidder1 has spent is ${balance2}`);

      console.log(`
            Check the amount of wFTM that bidder1 receives`);
      balance = await this.mockToken.balanceOf(bidder1);

      console.log(`
            The amount of wFTM that bidder1 receives: ${weiToEther(balance)}`);

      console.log(`
            Check the amount of wFTM that borrower is refunded`);
      balance2 = await this.mockToken.balanceOf(borrower);

      console.log(`
            The amount of wFTM that borrower is refunded: ${weiToEther(
              balance2
            )}`);

      console.log(`
            *The actual wFTM balance of bidder1 and the borrower should be 4999.5`);
      expect(weiToEther(balance) * 1 + weiToEther(balance2) * 1).to.be.equal(
        4999.5
      );

      console.log(`
            *The remaining of collateral with FantomMint should be 4999.5`);
      balance = await this.mockToken.balanceOf(this.fantomMint.address);
      expect(weiToEther(balance) * 1).to.be.equal(4999.5);
    });

    it('Scenario 3', async function() {
      console.log(`
            Scenario 3:
            Borrower approves and deposits 9999 wFTM, 
            Then mints possible max amount of fUSD,
            The price of the wFTM changes from 1 to 0.5,
            The liquidation starts
            Bidder1 tries to bid the auction to get all 9999 wFTM but forgets to approve enough amount
            The bid will fail`);

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
        from: borrower
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
        from: borrower
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
            An admin starts the liquidation`);
      let result = await this.fantomLiquidationManager.startLiquidation(
        borrower,
        { from: admin }
      );

      console.log(`
            *Event AuctionStarted should be emitted with correct values: nonce = 1, user = borrower`);
      expectEvent(result, 'AuctionStarted', {
        nonce: new BN('1'),
        user: borrower
      });

      console.log(`
            *Bidder1 bids all the collateral but will fail as he forgets to approve enough 
            amount of fUSD to be transferred`);
      await expectRevert(
        this.fantomLiquidationManager.bidAuction(1, new BN('100000000'), {
          from: bidder1,
          value: etherToWei(0.5)
        }),
        'Low allowance of debt token.'
      );
    });
  });
});
