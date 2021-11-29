pragma solidity ^0.5.0;

import '@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol';
import '@openzeppelin/upgrades/contracts/Initializable.sol';
import '@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol';

import '../interfaces/IFantomMintAddressProvider.sol';
import '../interfaces/IFantomDeFiTokenStorage.sol';
import '../modules/FantomMintErrorCodes.sol';
import '../FantomMint.sol';
import '../modules/FantomMintBalanceGuard.sol';

// FantomLiquidationManager implements the liquidation model
// with the ability to fine tune settings by the contract owner.
contract FantomLiquidationManager is
  function updateAuctionBeginPrice(uint256 _auctionBeginPrice)
    external
    onlyOwner
  {
    auctionBeginPrice = _auctionBeginPrice;
  }

  function updateIntervalPriceDiff(uint256 _intervalPriceDiff)
    external
    onlyOwner
  {
    intervalPriceDiff = _intervalPriceDiff;
  }

  function updateIntervalTimeDiff(uint256 _intervalTimeDiff)
    external
    onlyOwner
  {
    intervalTimeDiff = _intervalTimeDiff;
  }

  function updateAuctionMinPrice(uint256 _defaultMinPrice) external onlyOwner {
    defaultMinPrice = _defaultMinPrice;
  }

  function updatePercentPrecision(uint256 _percentPrecision)
    external
    onlyOwner
  {
    percentPrecision = _percentPrecision;
  }

  function updatePricePrecision(uint256 _pricePrecision) external onlyOwner {
    pricePrecision = _pricePrecision;
  }

  function updateAuctionDuration(uint256 _auctionDuration) external onlyOwner {
    auctionDuration = _auctionDuration;
  }

  function updateFantomFeeVault(address _fantomFeeVault) external onlyOwner {
    fantomFeeVault = _fantomFeeVault;
  }

  function updateFantomUSDAddress(address _fantomUSD) external onlyOwner {
    fantomUSD = _fantomUSD;
  }

  function updateAddressProvider(address _addressProvider) external onlyOwner {
    addressProvider = IFantomMintAddressProvider(_addressProvider);
  }

  function updateFantomMintContractAddress(address _fantomMintContract)
    external
    onlyOwner
  {
    fantomMintContract = _fantomMintContract;
  }

  function updateInitiatorBonus(uint256 _initatorBonus) external onlyOwner {
    initiatorBonus = _initatorBonus;
  }

  modifier auth() {
    require(admins[msg.sender], 'Sender not authorized');
    _;
  }

  modifier onlyNotContract() {
    require(_msgSender() == tx.origin);
    _;
  }

  // getCollateralPool returns the address of collateral pool.
  function getCollateralPool() public view returns (IFantomDeFiTokenStorage) {
    return addressProvider.getCollateralPool();
  }

  // getDebtPool returns the address of debt pool.
  function getDebtPool() public view returns (IFantomDeFiTokenStorage) {
    return addressProvider.getDebtPool();
  }

  // rewardIsEligible checks if the account is eligible to receive any reward.
  function collateralIsEligible(address _account) public view returns (bool) {
    return
      FantomMint(addressProvider.getAddress(MOD_FANTOM_MINT))
        .checkCollateralCanDecrease(
          _account,
          getCollateralPool().getToken(0),
          0
        );
  }

  function getLiquidationDetails(uint256 _nonce)
    external
    view
    returns (
      uint256,
      uint256,
      uint256,
      address[] memory,
      uint256[] memory,
      address[] memory,
      uint256[] memory
    )
  {
    require(
      auctionIndexer[_nonce].remainingPercentage > 0,
      'Auction not found'
    );
    AuctionInformation storage _auction = auctionIndexer[_nonce];
    uint256 timeDiff = _now().sub(_auction.startTime);
    uint256 currentRound = timeDiff.div(_auction.intervalTime);
    uint256 offeringRatio = _auction.startPrice.add(
      currentRound.mul(_auction.intervalPrice)
    );

    address[] memory collateralList = new address[](
      _auction.collateralList.length
    );
    uint256[] memory collateralValue = new uint256[](
      _auction.collateralList.length
    );
    address[] memory debtList = new address[](_auction.debtList.length);
    uint256[] memory debtValue = new uint256[](_auction.debtList.length);
    uint256 index;
    for (index = 0; index < _auction.collateralList.length; index++) {
      collateralList[index] = _auction.collateralList[index];
      collateralValue[index] = _auction
        .collateralValue[_auction.collateralList[index]]
        .mul(offeringRatio)
        .div(pricePrecision);
    }
    for (index = 0; index < _auction.debtList.length; index++) {
      debtList[index] = _auction.debtList[index];
      debtValue[index] = _auction.debtValue[_auction.debtList[index]];
    }
    return (
      offeringRatio,
      _auction.startTime,
      _auction.endTime,
      collateralList,
      collateralValue,
      debtList,
      debtValue
    );
  }

  function updateLiquidation(uint256 _nonce) public nonReentrant auth {
    require(live, 'Liquidation not live');
    require(
      auctionIndexer[_nonce].remainingPercentage > 0,
      'Auction not found'
    );
    AuctionInformation storage _auction = auctionIndexer[_nonce];
    uint256 timeDiff = _now().sub(_auction.startTime);
    uint256 currentRound = timeDiff.div(_auction.intervalTime);
    uint256 _nextPrice = _auction.startPrice.add(
      currentRound.mul(_auction.intervalPrice)
    );
    if (_auction.endTime >= _now() || _nextPrice >= _auction.minPrice) {
      // Restart the Auction
      _auction.startPrice = auctionBeginPrice;
      _auction.intervalPrice = intervalPriceDiff;
      _auction.minPrice = defaultMinPrice;
      _auction.startTime = _now();
      _auction.intervalTime = intervalTimeDiff;
      _auction.endTime = _now().add(auctionDuration);
      emit AuctionRestarted(_nonce, _auction.owner);
    }
  }

  function balanceOfRemainingDebt(uint256 _nonce)
    public
    view
    returns (uint256)
  {
    require(
      auctionIndexer[_nonce].remainingPercentage > 0,
      'Auction not found'
    );
    AuctionInformation storage _auction = auctionIndexer[_nonce];

    uint256 totalValue = 0;
    for (uint256 i = 0; i < _auction.debtList.length; i++) {
      totalValue += _auction.debtValue[_auction.debtList[i]];
    }

        'Low allowance of debt token.'
      );

      ERC20Burnable(_auction.debtList[index]).burnFrom(msg.sender, debtAmount);
      _auction.debtValue[_auction.debtList[index]] = _auction
        .debtValue[_auction.debtList[index]]
        .sub(debtAmount);
    }

    uint256 collateralPercent = actualPercentage.mul(offeringRatio).div(
      pricePrecision
    );

    for (index = 0; index < _auction.collateralList.length; index++) {
      uint256 collatAmount = _auction
        .collateralValue[_auction.collateralList[index]]
        .mul(collateralPercent)
        .div(percentPrecision);
      uint256 processedCollatAmount = _auction
        .collateralValue[_auction.collateralList[index]]
        .mul(actualPercentage)
        .div(percentPrecision);
      FantomMint(fantomMintContract).settleLiquidationBid(
        _auction.collateralList[index],
        msg.sender,
        collatAmount
      );
      FantomMint(fantomMintContract).settleLiquidationBid(
        _auction.collateralList[index],
        _auction.owner,
        processedCollatAmount.sub(collatAmount)
      );
      _auction.collateralValue[_auction.collateralList[index]] = _auction
        .collateralValue[_auction.collateralList[index]]
        .sub(processedCollatAmount);
    }

    _auction.remainingPercentage = _auction.remainingPercentage.sub(
      _percentage
    );

    if (actualPercentage == percentPrecision) {
      // Auction ended
      for (index = 0; index < _auction.collateralList.length; index++) {
        uint256 collatAmount = _auction.collateralValue[
          _auction.collateralList[index]
        ];
        FantomMint(fantomMintContract).settleLiquidationBid(
          _auction.collateralList[index],
          _auction.owner,
          collatAmount
        );
        _auction.collateralValue[_auction.collateralList[index]] = 0;
      }
    }
  }

  function startLiquidation(address _targetAddress)
    external
    nonReentrant
    onlyNotContract
  {
    require(live, 'Liquidation not live');
    // get the collateral pool
    IFantomDeFiTokenStorage collateralPool = getCollateralPool();
    // get the debt pool
    IFantomDeFiTokenStorage debtPool = getDebtPool();

    require(
      !collateralIsEligible(_targetAddress),
      'Collateral is not eligible for liquidation'
    );

    require(
      collateralPool.totalOf(_targetAddress) > 0,
      'The value of the collateral is 0'
    );

    addressProvider.getRewardDistribution().rewardUpdate(_targetAddress);

    AuctionInformation memory _tempAuction;
    _tempAuction.owner = _targetAddress;
    _tempAuction.initiator = msg.sender;
    _tempAuction.startPrice = auctionBeginPrice;
    _tempAuction.intervalPrice = intervalPriceDiff;
    _tempAuction.minPrice = defaultMinPrice;
    _tempAuction.startTime = _now();
    _tempAuction.intervalTime = intervalTimeDiff;
    _tempAuction.endTime = _now() + auctionDuration;

    totalNonce += 1;
    auctionIndexer[totalNonce] = _tempAuction;

    AuctionInformation storage _auction = auctionIndexer[totalNonce];
    _auction.nonce = totalNonce;

    uint256 index;
    uint256 tokenCount;
    address tokenAddress;
    uint256 tokenBalance;
    tokenCount = collateralPool.tokensCount();
    for (index = 0; index < tokenCount; index++) {
      tokenAddress = collateralPool.getToken(index);
      tokenBalance = collateralPool.balanceOf(_targetAddress, tokenAddress);
      if (tokenBalance > 0) {
        collateralPool.sub(_targetAddress, tokenAddress, tokenBalance);
        _auction.collateralList.push(tokenAddress);
        _auction.collateralValue[tokenAddress] = tokenBalance;
      }
    }

    tokenCount = debtPool.tokensCount();
    for (index = 0; index < tokenCount; index++) {
      tokenAddress = debtPool.getToken(index);
      tokenBalance = debtPool.balanceOf(_targetAddress, tokenAddress);
      if (tokenBalance > 0) {
        debtPool.sub(_targetAddress, tokenAddress, tokenBalance);
        _auction.debtList.push(tokenAddress);
        _auction.debtValue[tokenAddress] = tokenBalance.mul(101).div(100);
      }
    }

    _auction.remainingPercentage = percentPrecision;

    emit AuctionStarted(totalNonce, _targetAddress);
  }

  function updateLiquidationFlag(bool _live) external auth {
    live = _live;
  }

  function _now() internal view returns (uint256) {
    return now;
  }
}
