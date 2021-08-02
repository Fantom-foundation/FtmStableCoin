const {
    BN,
    constants,
    expectEvent,
    expectRevert,
  } = require('@openzeppelin/test-helpers')
const { ZERO_ADDRESS } = constants
  
const { expect } = require('chai')
 
const FantomMint = artifacts.require('FantomMint')

const addressProvider = '0xcb20a1A22976764b882C2f03f0C8523F3df54b10';
const wFTM = '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83';

contract('Unit Test for FantomMint', function ([owner]){


    beforeEach(async function () {
        this.fantomMint = await FantomMint.new ({from:owner})
        await this.fantomMint.initialize(owner, addressProvider)
    })

    describe('view functions', function () {
        
        it('gets collaterallowestDebtRatio4dec', async function () {
            const collaterallowestDebtRatio4dec = await this.fantomMint.getCollateralLowestDebtRatio4dec();
            console.log(collaterallowestDebtRatio4dec.toString())
            expect(collaterallowestDebtRatio4dec).to.be.bignumber.greaterThan('0');
        })

        it('gets the price of wFTM', async function () {
            const price = await this.fantomMint.getPrice(wFTM);
            console.log(price.toString())
            expect(price).to.be.bignumber.greaterThan('0')
        })

        it('gets the extended price of wFTM', async function () {
            const extendedPrice = await this.fantomMint.getExtendedPrice(wFTM);
            console.log(extendedPrice[0].toString());
            console.log(extendedPrice[1].toString());
            expect(extendedPrice[0]).to.be.bignumber.greaterThan('0');
            expect(extendedPrice[1]).to.be.bignumber.greaterThan('0');
        })
    
    })
})