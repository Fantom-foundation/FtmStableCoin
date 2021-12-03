pragma solidity ^0.5.0;

import "../liquidator/FantomLiquidationManager.sol";

contract MockStartLiquidation {
    function startLiquidation(
        address fantomLiquidationManagerAddress,
        address _targetAddress
    ) public {
        FantomLiquidationManager(fantomLiquidationManagerAddress)
            .startLiquidation(_targetAddress);
    }
}
