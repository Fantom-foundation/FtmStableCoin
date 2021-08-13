pragma solidity ^0.5.0;

import "@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";

import "../interfaces/IFantomMintAddressProvider.sol";
import "../interfaces/IFantomDeFiTokenStorage.sol";
import "../modules/FantomMintErrorCodes.sol";
import "../FantomMint.sol";
import "../modules/FantomMintBalanceGuard.sol";

// FantomLiquidationManager implements the liquidation model
// with the ability to fine tune settings by the contract owner.
contract FantomLiquidationManager is Initializable, Ownable, FantomMintErrorCodes
{
    // define used libs
    using SafeMath for uint256;
    using Address for address;
    using SafeERC20 for ERC20;
    
    // increasing contract's collateral value.
    event Deposited(address indexed token, address indexed user, uint256 amount);

    // decreasing contract's collateral value.
    event Withdrawn(address indexed token, address indexed user, uint256 amount);
    
    event AuctionStarted(address indexed user);
    event AuctionRestarted(address indexed user);

    struct AuctionInformation {
        address owner;
        uint256 startTime;
        uint256 intervalTime;
        uint256 endTime;
        uint256 startPrice;
        uint256 currentPrice;
        uint256 intervalPrice;
        uint256 minPrice;
        uint256 round;
    }

    bytes32 private constant MOD_FANTOM_MINT = "fantom_mint";
    bytes32 private constant MOD_COLLATERAL_POOL = "collateral_pool";
    bytes32 private constant MOD_DEBT_POOL = "debt_pool";
    bytes32 private constant MOD_PRICE_ORACLE = "price_oracle_proxy";
    bytes32 private constant MOD_REWARD_DISTRIBUTION = "reward_distribution";
    bytes32 private constant MOD_TOKEN_REGISTRY = "token_registry";
    bytes32 private constant MOD_ERC20_REWARD_TOKEN = "erc20_reward_token";

    mapping(address => mapping(address => uint256)) public liquidatedVault;
    mapping(address => AuctionInformation) public auctionList;
    
    address[] public collateralOwners;
    mapping(address => uint) public auctionIndex;

    // addressProvider represents the connection to other FMint related
    // contracts.
    IFantomMintAddressProvider public addressProvider;

    mapping(address => bool) public admins;

    address public fantomUSD;
    address public collateralContract;
    address public fantomMintContract;

    uint256 internal intervalPriceDiff;
    uint256 internal intervalTimeDiff;
    uint256 internal auctionBeginPrice;
    uint256 internal defaultMinPrice;
    uint256 internal minDebtValue;

    bool public live;
    uint256 public maxAmt;
    uint256 public targetAmt;

    uint256 constant WAD = 10 ** 18;

    // initialize initializes the contract properly before the first use.
    function initialize(address owner, address _addressProvider) public initializer {
        // initialize the Ownable
        Ownable.initialize(owner);

        // remember the address provider for the other protocol contracts connection
        addressProvider = IFantomMintAddressProvider(_addressProvider);

        // initialize default values
        admins[owner] = true;
        live = true;
        auctionBeginPrice = 300;
        intervalPriceDiff = 10;
        intervalTimeDiff = 60;
        defaultMinPrice = 200;
        minDebtValue = 100;
    }

    function addAdmin(address usr) external onlyOwner {
        admins[usr] = true;
    }

    function removeAdmin(address usr) external onlyOwner {
        admins[usr] = false;
    }

    function updateAuctionBeginPrice(uint256 _auctionBeginPrice) external onlyOwner {
        auctionBeginPrice = _auctionBeginPrice;
    }

    function updateIntervalPriceDiff(uint256 _intervalPriceDiff) external onlyOwner {
        intervalPriceDiff = _intervalPriceDiff;
    }

    function updateIntervalTimeDiff(uint256 _intervalTimeDiff) external onlyOwner {
        intervalTimeDiff = _intervalTimeDiff;
    }

    function updateAuctionMinPrice(uint256 _defaultMinPrice) external onlyOwner {
        defaultMinPrice = _defaultMinPrice;
    }

    function updateMinimumDebtValue(uint256 _minDebtValue) external onlyOwner {
        minDebtValue = _minDebtValue;
    }

    function updateFantomUSDAddress(address _fantomUSD) external onlyOwner {
        fantomUSD = _fantomUSD;
    }

    function updateAddressProvider(address _addressProvider) external onlyOwner {
        addressProvider = IFantomMintAddressProvider(_addressProvider);
    }

    function updateCollateralContractAddress(address _collateralContract) external onlyOwner {
        collateralContract = _collateralContract;
    }

    function updateFantomMintContractAddress(address _fantomMintContract) external onlyOwner {
        fantomMintContract = _fantomMintContract;
    }

    modifier auth {
        require(admins[msg.sender], "Sender not authorized");
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
        return FantomMint(addressProvider.getAddress(MOD_FANTOM_MINT)).checkCollateralCanDecrease(_account, getCollateralPool().tokens(0), 0);
    }

    function getLiquidationList() external view returns (address[] memory) {
        return collateralOwners;
    }

    function getLiquidationDetails(address _collateralOwner) external view returns (uint256, uint256, uint256) {
        AuctionInformation memory _auction = auctionList[_collateralOwner];
        return (_auction.startTime, _auction.endTime, _auction.currentPrice);
    }

    function updateLiquidation(address _collateralOwner) public auth {
        AuctionInformation storage _auction = auctionList[_collateralOwner];
        require(_auction.round > 0, "Auction not found");
        uint256 timeDiff = now - _auction.startTime;
        uint256 currentRound = timeDiff / _auction.intervalTime;
        uint256 _nextPrice = _auction.startPrice - currentRound * _auction.intervalPrice;
        if (_auction.endTime >= now || _nextPrice < _auction.minPrice) {
            // Restart the Auction
            _auction.round = _auction.round + 1;
            _auction.startPrice = auctionBeginPrice;
            _auction.currentPrice = auctionBeginPrice;
            _auction.intervalPrice = intervalPriceDiff;
            _auction.minPrice = defaultMinPrice;
            _auction.startTime = now;
            _auction.intervalTime = intervalTimeDiff;
            _auction.endTime = now + 60000;
            emit AuctionRestarted(_collateralOwner);
        } else {
            // Decrease the price
            _auction.currentPrice = _nextPrice;
        }
    }

    function balanceOfRemainingCollateral(address _collateralOwner) public view returns (uint256) {
        IFantomDeFiTokenStorage pool = getCollateralPool();
        
        uint totalValue = 0;
        for (uint i = 0; i < pool.tokensCount(); i++) {
            totalValue += liquidatedVault[_collateralOwner][pool.tokens(i)];
        }

        return totalValue;
    }

    function bidAuction(address _collateralOwner, address _token, uint256 amount) public returns (uint256) {
        require(auctionIndex[_collateralOwner] > 0, "Target Collateral is not in Auction.");
        require(liquidatedVault[_collateralOwner][_token] >= amount, "Collateral is not sufficient to buy.");

        AuctionInformation storage _auction = auctionList[_collateralOwner];

        uint256 buyValue = getCollateralPool().tokenValue(_token, amount);
        uint256 debtValue = buyValue
            .mul(10000)
            .div(_auction.currentPrice);
        
        // make sure caller has enough fUSD to cover the collateral
        if (debtValue >= ERC20(fantomUSD).balanceOf(msg.sender)) {
            return ERR_LOW_BALANCE;
        }

        // make sure we are allowed to transfer fUSD from the caller
        // to the liqudation pool.
        if (debtValue >= ERC20(fantomUSD).allowance(msg.sender, address(this))) {
            return ERR_LOW_ALLOWANCE;
        }

        // make sure the collateral is sufficient to buy
        if (amount >= ERC20(_token).balanceOf(collateralContract)) {
            return ERR_LOW_BALANCE;
        }

        // make sure we are allowed to transfer the collateral from the collateral contract
        // to the buyer
        if (amount >= ERC20(_token).allowance(collateralContract, msg.sender)) {
            return ERR_LOW_ALLOWANCE;
        }

        ERC20(fantomUSD).safeTransferFrom(msg.sender, address(this), debtValue);

        ERC20(_token).safeTransferFrom(collateralContract, msg.sender, amount);

        liquidatedVault[_collateralOwner][_token] -= amount;

        emit Withdrawn(_token, msg.sender, amount);

        // Check if auction is finished or not
        bool auctionEnded = false;

        if (liquidatedVault[_collateralOwner][_token] == 0) {
            auctionEnded = balanceOfRemainingCollateral(_collateralOwner) > 0;
        }

        if (auctionEnded) {
            uint indexOfArray = auctionIndex[_collateralOwner];
            if (indexOfArray == collateralOwners.length) {
                auctionIndex[_collateralOwner] = 0;
                collateralOwners.pop();
            } else {
                collateralOwners[indexOfArray - 1] = collateralOwners[collateralOwners.length - 1];
                collateralOwners.pop();
                auctionIndex[collateralOwners[indexOfArray - 1]] = indexOfArray;
            }
        }
        return ERR_NO_ERROR;
    }

    function getAuctionResource(address _collateralOwner) public returns (address[] memory, uint256[] memory) {
        uint256[] memory amounts = new uint256[](getCollateralPool().tokensCount());
        for (uint i = 0; i < getCollateralPool().tokensCount(); i++) {
            address _token = getCollateralPool().tokens(i);
            amounts[i] = liquidatedVault[_collateralOwner][_token];
        }
        return (getCollateralPool().getTokens(), amounts);
    }

    function startLiquidation(address targetAddress) external auth {
        require(live, "Liquidation not live");
        // get the collateral pool
        IFantomDeFiTokenStorage pool = getCollateralPool();
        // get the debt pool
        IFantomDeFiTokenStorage debtPool = getDebtPool();

        require(!collateralIsEligible(targetAddress), "Collateral is not eligible for liquidation");

        require(pool.totalOf(targetAddress) > 0, "The value of the collateral is 0");

        addressProvider.getRewardDistribution().rewardUpdate(targetAddress);

        uint256 debtValue = getDebtPool().totalOf(targetAddress);

        require(debtValue >= minDebtValue, "The value of the debt is less than the minimum debt value");
        
        uint index;
        for (index = 0; index < pool.tokensCount(); index++) {
            uint256 collatBalance = pool.balanceOf(targetAddress, pool.tokens(index));
            liquidatedVault[targetAddress][pool.tokens(index)] += collatBalance;
            pool.sub(targetAddress, pool.tokens(index), collatBalance);
        }

        for (index = 0; index < debtPool.tokensCount(); index++) {
            uint256 debtBalance = debtPool.balanceOf(targetAddress, debtPool.tokens(index));
            debtPool.sub(targetAddress, debtPool.tokens(index), debtBalance);
        }

        if (auctionIndex[targetAddress] == 0) {
            collateralOwners.push(targetAddress);
            auctionIndex[targetAddress] = collateralOwners.length;
        }

        startAuction(targetAddress);
    }

    function startAuction(address _collateralOwner) internal {
        AuctionInformation memory _auction;
        _auction.owner = _collateralOwner;
        _auction.round = 1;
        _auction.startPrice = auctionBeginPrice;
        _auction.currentPrice = auctionBeginPrice;
        _auction.intervalPrice = intervalPriceDiff;
        _auction.minPrice = defaultMinPrice;
        _auction.startTime = now;
        _auction.intervalTime = intervalTimeDiff;
        _auction.endTime = now + 60000;
        
        auctionList[_collateralOwner] = _auction;

        emit AuctionStarted(_collateralOwner);
    }

    function updateLiquidationFlag(bool _live) external auth {
        live = _live;
    }
}