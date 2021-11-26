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
  borrower2,
  bidder1,
  bidder2,
  fantomFeeVault
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
    it('Scenario 8', async function() {
      console.log(`
            Scenario 8:
            Borrower approves and deposits 9999 wFTMs, 
            Then mints possible max amount of fUSD,
            Borrower decides to repay all the debt and get his 9999 wFTMs back
            The liquidation starts but it will fail with "Collateral is not eligible for liquidation"
            `);

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
            Mint another 100 fUSD to the borrower for free to ensure he/she can repay all the debt`);
      await this.fantomFUSD.mint(borrower, etherToWei('100'), { from: owner });

      balance = await this.fantomFUSD.balanceOf(borrower);
      console.log(`
            The fUSD balance of the borrower before repayment: ${weiToEther(
              balance
            )}`);

      console.log(`
            Check the actual debt to repay`);
      balance = await this.debtPool.balanceOf(
        borrower,
        this.fantomFUSD.address
      );
      console.log(
        `
            fUSD debt balance:`,
        weiToEther(balance)
      );

      console.log(`
            Borrower approves slightly more than ${weiToEther(
              balance
            )} to FantomMint`);
      await this.fantomFUSD.approve(
        this.fantomMint.address,
        etherToWei(1 + weiToEther(balance)),
        { from: borrower }
      );

      console.log(`
            Now borrower repays the debt in full`);
      let result = await this.fantomMint.mustRepayMax(this.fantomFUSD.address, {
        from: borrower
      });

      //console.log(result.logs[0].args.amount.toString());
      console.log(`
            *Event Repaid should be emitted with correct values:
            token: ${this.fantomFUSD.address},
            user : ${borrower},
            amount: ${weiToEther(balance).toString()} `);

      expectEvent(result, 'Repaid', {
        token: this.fantomFUSD.address,
        user: borrower,
        amount: balance
      });

      console.log(`
            Now the borrower withdraws all his collateral`);
      await this.fantomMint.mustWithdraw(
        this.mockToken.address,
        etherToWei(9999),
        { from: borrower }
      );
      console.log(`
            *The amount of wFTM that borrower has should be 9999 again`);
      balance = await this.mockToken.balanceOf(borrower);
      console.log(`
            wFTM balance of borrower after repayment: ${weiToEther(balance)}`);
      expect(weiToEther(balance).toString()).to.be.equal('9999');

      balance = await this.fantomFUSD.balanceOf(borrower);
      console.log(`
            fUSD balance of borrower after repayment: ${weiToEther(balance)}`);
    });

    it('Scenario 9', async function() {
      console.log(`
            Scenario 9:
            Borrower approves and deposits 9999 wFTMs, 
            Borrower2 approves and deposits 9999 wFTM2s, 
            Then mints possible max amount of fUSD,
            The price of wFTM2 drops to 0.5 USD,
            The liquidation of borrower2's collateral starts"
            `);

      console.log('');
      console.log(`
            Mint 9999 wFTMs for the borrower so he/she can borrow some fUSD`);
      await this.mockToken.mint(borrower, etherToWei(9999));

      console.log(`
            Mint 9999 wFTM2s for the borrower2 so he/she can borrow some fUSD`);
      await this.mockToken2.mint(borrower2, etherToWei(9999));

      console.log(`
            Mint bidder1 10000 fUSDs to bid for the liquidated collateral`);
      await this.fantomFUSD.mint(bidder1, etherToWei(10000), { from: owner });

      console.log(`
            Borrower approves 9999 wFTM to FantomMint contract`);
      await this.mockToken.approve(this.fantomMint.address, etherToWei(9999), {
        from: borrower
      });

      console.log(`
            Borrower2 approves 9999 wFTM2 to FantomMint contract`);
      await this.mockToken2.approve(this.fantomMint.address, etherToWei(9999), {
        from: borrower2
      });

      console.log(`
            Borrower deposits all his/her 9999 wFTMs`);
      await this.fantomMint.mustDeposit(
        this.mockToken.address,
        etherToWei(9999),
        { from: borrower }
      );

      console.log(`
            Borrower2 deposits all his/her 9999 wFTM2s`);
      await this.fantomMint.mustDeposit(
        this.mockToken2.address,
        etherToWei(9999),
        { from: borrower2 }
      );

      console.log(`
            *Now the borrower should have 0 wFTM`);
      let balance = await this.mockToken.balanceOf(borrower);
      expect(balance).to.be.bignumber.equal('0');

      console.log(`
            *Now the borrower2 should have 0 wFTM2`);
      balance = await this.mockToken2.balanceOf(borrower2);
      expect(balance).to.be.bignumber.equal('0');

      console.log(`
            Mint the maximum amount of fUSD for the borrower`);
      await this.fantomMint.mustMintMax(this.fantomFUSD.address, 32000, {
        from: borrower
      });

      console.log(`
            Mint the maximum amount of fUSD for the borrower2`);
      await this.fantomMint.mustMintMax(this.fantomFUSD.address, 32000, {
        from: borrower2
      });

      console.log(`
            *Now borrower should have fUSD between 0 and 3333`);
      let amount = await this.fantomFUSD.balanceOf(borrower);
      expect(amount).to.be.bignumber.greaterThan('0');
      expect(weiToEther(amount) * 1).to.be.lessThanOrEqual(3333);
      console.log(
        `
            The actual amount of fUSD minted for borrower: `,
        weiToEther(amount)
      );

      console.log(`
            *Now borrower2 should have fUSD between 0 and 3333`);
      amount = await this.fantomFUSD.balanceOf(borrower2);
      expect(amount).to.be.bignumber.greaterThan('0');
      expect(weiToEther(amount) * 1).to.be.lessThanOrEqual(3333);
      console.log(
        `
            The actual amount of fUSD minted for borrower2: `,
        weiToEther(amount)
      );

      console.log(`
            Let's set the price of wFTM2 to 0.5 USD`);
      await this.mockPriceOracleProxy.setPrice(
        this.mockToken2.address,
        etherToWei(0.5)
      );

      console.log(`
            An admin starts the liquidation of borrower2's collateral`);
      let result = await this.fantomLiquidationManager.startLiquidation(
        borrower2,
        { from: admin }
      );

      console.log(`
            Let's set the price of wFTM to 0.5 USD`);
      await this.mockPriceOracleProxy.setPrice(
        this.mockToken.address,
        etherToWei(0.5)
      );

      console.log(`
            An admin starts the liquidation of borrower's collateral`);
      result = await this.fantomLiquidationManager.startLiquidation(borrower, {
        from: admin
      });
    });
  });
});
