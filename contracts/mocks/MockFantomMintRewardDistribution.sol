pragma solidity ^0.5.0;

import "../utility/FantomMintRewardDistribution.sol";

contract MockFantomMintRewardDistribution is FantomMintRewardDistribution {
    uint256 public time;

    function setTime(uint256 t) public {
        time = t;
    }

    function increaseTime(uint256 t) public {
        time += t;
    }

    function _now() internal view returns (uint256) {
        return time;
    }
}
