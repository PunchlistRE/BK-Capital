// Harbor Point with the brief's own financing, reserve and waterfall terms switched on (the terms the base deal.js could not enter).
// Where the brief is silent the choice is stated here: four reserve buckets are shown as the three the model can hold (operating / lease-up at completion; debt service and the rest held at closing).
const D = require('./deal.js');
module.exports = Object.assign({}, D, {
  conFixedAmt: 27300000, conCeiling: 34000000, conEquityFirst: 14700000, conUnusedFeePct: 0.005,   // fixed $27.3M facility, $34M ceiling, equity funds the first $14.7M, 0.5% on the undrawn principal
  initReserves: [{ name: 'Operating / lease-up', amount: 750000, at: 'co', use: 'operating' }, { name: 'Debt service / interest', amount: 750000, at: 'close', use: 'held' }, { name: 'Other initial reserves', amount: 500000, at: 'close', use: 'held' }],
  prefLPOnly: 1, gpCatchupRate: 0.5
});
