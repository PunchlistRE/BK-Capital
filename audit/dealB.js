// Scenario B: same property, value-add upside case - pushes cash through every waterfall tier
module.exports = Object.assign({}, require(__dirname + '/deal.js'), { dealId:'TEST-002', name:'Audit Test Apartments - Upside',
  rentGrowth:0.06, exitCap:0.05, purchasePrice:21000000, gpShare:0.10 });
