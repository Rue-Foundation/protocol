const addressBook = require('../address-book.json');
const BigNumber = require('bignumber.js');
const environmentConfig = require('../deployment/environment.config.js');
const fs = require('fs');
const rp = require('request-promise');
const Web3 = require('web3');
// TODO: should we have a separate token config for development network?
const tokenInfo = require('../migrations/config/token_info.js').kovan;

const environment = 'development';
const apiPath = 'https://min-api.cryptocompare.com/data/price';
const config = environmentConfig[environment];
const web3 = new Web3(new Web3.providers.HttpProvider(`http://${config.host}:${config.port}`));

describe('Fund shares', () => {
  let accounts;
  let manager;
  let investor;
  let opts;
  let datafeed;
  let mlnToken;
  let ethToken;
  let eurToken;
  let participation;
  let fund;
  let worker;
  let version;

  const addresses = addressBook[environment];

  beforeAll(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 15000; // datafeed updates must take a few seconds
    accounts = await web3.eth.getAccounts();
    manager = accounts[1];
    investor = accounts[2];
    worker = accounts[3];
    opts = { from: accounts[0], gas: config.gas, gasPrice: config.gasPrice, };

    // retrieve deployed contracts
    version = await new web3.eth.Contract(
      JSON.parse(fs.readFileSync('out/version/Version.abi')), addresses.Version
    );
    datafeed = await new web3.eth.Contract(
      JSON.parse(fs.readFileSync('out/datafeeds/DataFeed.abi')), addresses.DataFeed
    );
    mlnToken = await new web3.eth.Contract(
      JSON.parse(fs.readFileSync('out/assets/PreminedAsset.abi')), addresses.MlnToken
    );
    ethToken = await new web3.eth.Contract(
      JSON.parse(fs.readFileSync('out/assets/PreminedAsset.abi')), addresses.EthToken
    );
    eurToken = await new web3.eth.Contract(
      JSON.parse(fs.readFileSync('out/assets/PreminedAsset.abi')), addresses.EurToken
    );
    participation = await new web3.eth.Contract(
      JSON.parse(fs.readFileSync('out/participation/Participation.abi')), addresses.Participation
    );

    participation.methods.attestForIdentity(investor).send(opts);   // whitelist investor
  });

  // register block force mining method
  web3.extend({
    methods: [{
      name: 'mineBlock',
      call: 'evm_mine'
    }]
  });

  // convenience functions
  function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function updateDatafeed() {
    const fromSymbol = 'MLN';
    const toSymbols = ['ETH', 'EUR', 'MLN'];
    const options = {
      uri: `${apiPath}?fsym=${fromSymbol}&tsyms=${toSymbols.join(',')}&sign=true`,
      json: true
    }
    const queryResult = await rp(options);
    const ethDecimals = tokenInfo.filter(token => token.symbol === 'ETH-T')[0].decimals
    const eurDecimals = tokenInfo.filter(token => token.symbol === 'EUR-T')[0].decimals
    const mlnDecimals = tokenInfo.filter(token => token.symbol === 'MLN-T')[0].decimals
    const inverseEth = new BigNumber(1).div(new BigNumber(queryResult.ETH)).toNumber().toFixed(15);
    const inverseEur = new BigNumber(1).div(new BigNumber(queryResult.EUR)).toNumber().toFixed(15);
    const inverseMln = new BigNumber(1).div(new BigNumber(queryResult.MLN)).toNumber().toFixed(15);
    const convertedEth = new BigNumber(inverseEth).div(10 ** (ethDecimals - mlnDecimals)).times(10 ** ethDecimals);
    const convertedEur = new BigNumber(inverseEur).div(10 ** (eurDecimals - mlnDecimals)).times(10 ** eurDecimals);
    const convertedMln = new BigNumber(inverseMln).div(10 ** (mlnDecimals - mlnDecimals)).times(10 ** mlnDecimals);
    await timeout(3000);
    await datafeed.methods.update(
      [ethToken.options.address, eurToken.options.address, mlnToken.options.address],
      [convertedEth, convertedEur, convertedMln],
    ).send(opts);
  }

  async function getAllBalances() {
    return {
      investor: {
        mlnToken: Number(await mlnToken.methods.balanceOf(investor).call()),
        ethToken: Number(await ethToken.methods.balanceOf(investor).call()),
      },
      manager: {
        mlnToken: Number(await mlnToken.methods.balanceOf(manager).call()),
        ethToken: Number(await ethToken.methods.balanceOf(manager).call()),
      },
      fund: {
        mlnToken: Number(await mlnToken.methods.balanceOf(fund.options.address).call()),
        ethToken: Number(await ethToken.methods.balanceOf(fund.options.address).call()),
      }
    }
  }

  describe('Setup', async () => {
    it('can set up new fund', async () => {
      await updateDatafeed();
      await version.methods.setupFund(
        'Melon Portfolio',  // name
        addresses.MlnToken, // reference asset
        config.protocol.fund.managementReward,
        config.protocol.fund.performanceReward,
        addresses.Participation,
        addresses.RMMakeOrders,
        addresses.Sphere
      ).send({from: manager, gas: 6900000});
      const fundId = await version.methods.getLastFundId().call();
      const fundAddress = await version.methods.getFundById(fundId).call();
      fund = await new web3.eth.Contract(
        JSON.parse(fs.readFileSync('out/Fund.abi')), fundAddress
      );

      expect(Number(fundId)).toEqual(0);
    });

    it('initial calculations', async () => {
      await updateDatafeed();
      const [gav, managementReward, performanceReward, unclaimedRewards, nav, sharePrice] = Object.values(await fund.methods.performCalculations().call(opts));

      expect(Number(gav)).toEqual(0);
      expect(Number(managementReward)).toEqual(0);
      expect(Number(performanceReward)).toEqual(0);
      expect(Number(unclaimedRewards)).toEqual(0);
      expect(Number(nav)).toEqual(0);
      expect(Number(sharePrice)).toEqual(10 ** 18);
    });
    const initialTokenAmount = 10000000000;
    it('investor receives initial token from liquidity provider', async () => {
      const pre = await getAllBalances();
      await mlnToken.methods.transfer(investor, initialTokenAmount).send({from: accounts[0]});
      const post = await getAllBalances();

      expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken + initialTokenAmount);
      expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
      expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
      expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
      expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
      expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
    });
  });
  const testArray = [
    { wantedShares: 10000, offeredValue: 10000, incentive: 100 },
    { wantedShares: 20143783, offeredValue: 30000000, incentive: 5000 },
    { wantedShares: 500, offeredValue: 2000, incentive: 5000 },
  ];
  testArray.forEach((test, index) => {
    describe(`Subscription request and execution, round ${index + 1}`, async () => {
      let fundPreCalculations;
      let offerRemainder;
      beforeAll(async () => {
        fundPreCalculations = Object.values(await fund.methods.performCalculations().call(opts));
      });
      afterAll(async () => {
        fundPreCalculations = [];
      });
      it('funds approved, and subscribe request issued, but tokens do not change ownership', async () => {
        const pre = await getAllBalances();
        const inputAllowance = test.offeredValue + test.incentive;
        const fundPreAllowance = Number(await mlnToken.methods.allowance(investor, fund.options.address).call());
        await mlnToken.methods.approve(fund.options.address, inputAllowance).send({from: investor});
        const fundPostAllowance = Number(await mlnToken.methods.allowance(investor, fund.options.address).call());

        expect(fundPostAllowance).toEqual(fundPreAllowance + inputAllowance);

        await fund.methods.requestSubscription(
          test.offeredValue, test.wantedShares, test.incentive
        ).send({from: investor, gas: config.gas});
        const post = await getAllBalances();

        expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
        expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
        expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
        expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
        expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
        expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
      });
      it('logs request event', async () => {
        const events = await fund.getPastEvents('RequestUpdated');

        expect(events.length).toEqual(1);
      });
      it('executing subscribe request transfers incentive to worker, shares to investor, and remainder of subscription offer to investor', async () => {
        await updateDatafeed();
        await web3.mineBlock();
        await updateDatafeed();
        await web3.mineBlock();
        const pre = await getAllBalances();
        const baseUnits = await fund.methods.getBaseUnits().call();
        const sharePrice = await fund.methods.calcSharePrice().call();
        const requestedSharesTotalValue = test.wantedShares * sharePrice / baseUnits;
        offerRemainder = test.offeredValue - requestedSharesTotalValue;
        const workerPreMln = Number(await mlnToken.methods.balanceOf(worker).call());
        const investorPreShares = Number(await fund.methods.balanceOf(investor).call());
        const requestId = await fund.methods.getLastRequestId().call();
        await fund.methods.executeRequest(requestId).send({from: worker, gas: 3000000});
        const post = await getAllBalances();
        const investorPostShares = Number(await fund.methods.balanceOf(investor).call());
        const workerPostMln = Number(await mlnToken.methods.balanceOf(worker).call());

        expect(Number(investorPostShares)).toEqual(investorPreShares + test.wantedShares);
        expect(workerPostMln).toEqual(workerPreMln + test.incentive);
        expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken - test.incentive - test.offeredValue + offerRemainder);
        expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
        expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
        expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
        expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken + test.offeredValue - offerRemainder);
        expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
      });
      it('reduce leftover allowance of investor MLN to zero', async () => {
        await mlnToken.methods.approve(fund.options.address, 0).send({from: investor});
        const remainingApprovedMln = Number(await mlnToken.methods.allowance(investor, fund.options.address).call());

        expect(remainingApprovedMln).toEqual(0);
      });
      it('performs calculation correctly', async () => {
        await web3.mineBlock();
        const [preGav, preManagementReward, prePerformanceReward, preUnclaimedRewards, preNav, preSharePrice] = fundPreCalculations.map(element => Number(element));
        const [postGav, postManagementReward, postPerformanceReward, postUnclaimedRewards, postNav, postSharePrice] = Object.values(
          await fund.methods.performCalculations().call()
        );

        expect(Number(postGav)).toEqual(preGav + test.offeredValue - offerRemainder);
        expect(Number(postManagementReward)).toEqual(preManagementReward);
        expect(Number(postPerformanceReward)).toEqual(prePerformanceReward);
        expect(Number(postUnclaimedRewards)).toEqual(preUnclaimedRewards);
        expect(Number(postNav)).toEqual(preNav + test.offeredValue - offerRemainder);
        expect(Number(postSharePrice)).toEqual(preSharePrice); // no trades have been made
      });
    });
  });
  describe('request and execute redemption', async () => {
    let initialInvestorShares;
    const partialRedemptionAmount = 33333;
    beforeAll(async () => {
      initialInvestorShares = Number(await fund.methods.balanceOf(investor).call());
    });
    const testArray = [
      { wantedShares: 10000, wantedValue: 10000, incentive: 100 },
      { wantedShares: 500, wantedValue: 3000, incentive: 500 },
      { wantedShares: 20143783, wantedValue: 2000, incentive: 5000 },
    ];
    testArray.forEach((test, index) => {
      let fundPreCalculations;
      let offerRemainder;
      beforeAll(async () => {
        fundPreCalculations = Object.values(await fund.methods.performCalculations().call(opts));
      });
      afterAll(async () => {
        fundPreCalculations = [];
      });
      describe(`Subscription request and execution, round ${index + 1}`, async () => {
        it('investor can request redemption from fund', async () => {
          const pre = await getAllBalances();
          await mlnToken.methods.approve(
            fund.options.address, test.incentive
          ).send({from: investor});
          await fund.methods.requestRedemption(
            test.wantedShares, test.wantedValue, test.incentive
          ).send({from: investor, gas: 3000000});
          const post = await getAllBalances();

          expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken);
          expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
          expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
          expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
          expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
          expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
        });
        it('logs RequestUpdated event', async () => {
          const events = await fund.getPastEvents('RequestUpdated');

          expect(events.length).toEqual(1);
        });
        it('reduces leftover allowance to zero', async () => {
          await mlnToken.methods.approve(fund.options.address, 0).send({from: investor});
          const remainingApprovedMln = Number(await mlnToken.methods.allowance(investor, fund.options.address).call());

          expect(remainingApprovedMln).toEqual(0);
        });
        it('executing request moves token from fund to investor, shares annihilated, and incentive to worker', async () => {
          await updateDatafeed();
          await web3.mineBlock();
          await updateDatafeed();
          await web3.mineBlock();
          const pre = await getAllBalances();
          const investorPreShares = Number(await fund.methods.balanceOf(investor).call());
          const preTotalShares = Number(await fund.methods.totalSupply().call());
          const workerPreMln = Number(await mlnToken.methods.balanceOf(worker).call());
          const requestId = await fund.methods.getLastRequestId().call();
          await fund.methods.executeRequest(requestId).send({from: worker, gas: 3000000});
          const investorPostShares = Number(await fund.methods.balanceOf(investor).call());
          const postTotalShares = Number(await fund.methods.totalSupply().call());
          const workerPostMln = Number(await mlnToken.methods.balanceOf(worker).call());
          const post = await getAllBalances();

          expect(investorPostShares).toEqual(investorPreShares - test.wantedShares);
          expect(postTotalShares).toEqual(preTotalShares - test.wantedShares);
          expect(workerPostMln).toEqual(workerPreMln + test.incentive);
          expect(post.investor.mlnToken).toEqual(pre.investor.mlnToken + test.wantedValue);
          expect(post.investor.ethToken).toEqual(pre.investor.ethToken);
          expect(post.manager.ethToken).toEqual(pre.manager.ethToken);
          expect(post.manager.mlnToken).toEqual(pre.manager.mlnToken);
          expect(post.fund.mlnToken).toEqual(pre.fund.mlnToken);
          expect(post.fund.ethToken).toEqual(pre.fund.ethToken);
        });
      });
    });
  });
});
