const Campaign = artifacts.require("Campaign");
const BeneficiaryRepository = artifacts.require("BeneficiaryRepository.sol");

const { time } = require("openzeppelin-test-helpers");
const truffleAssertions = require("truffle-assertions");
const { nextDayInSec } = require("./utils/time");
const { ZERO_ADDRESS } = require("./utils/constants");

const toBN = (num) => new web3.utils.BN(num);

const getTxCost = async (tx) => {
  const gasUsed = tx.receipt.gasUsed;
  const gasPrice = (await web3.eth.getTransaction(tx.tx)).gasPrice;
  return toBN(gasUsed).mul(toBN(gasPrice));
};

contract("Campagin", ([author, donor, donor2, beneficiary]) => {
  let campaign;
  let campaignEnd;

  const campaignTarget = 10000;

  beforeEach("setup contract for each test", async () => {
    campaignEnd = await nextDayInSec();
    campaign = await Campaign.new(
      "test",
      "test",
      campaignTarget,
      campaignEnd,
      author
    );
  });

  context("Initialization", () => {
    it("should set data correctly", async () => {
      const [
        title,
        description,
        targetAmount,
        endTimestamp,
        campaignAuthor,
      ] = await Promise.all([
        campaign.title(),
        campaign.description(),
        campaign.targetAmount(),
        campaign.endTimestamp(),
        campaign.author(),
      ]);

      assert.equal(title, "test");
      assert.equal(description, "test");
      assert.equal(targetAmount.toNumber(), campaignTarget); // todo: use BN
      assert.equal(endTimestamp.toNumber(), campaignEnd);
      assert.equal(campaignAuthor, author);
    });

    it("should require title", async () => {
      await truffleAssertions.reverts(
        Campaign.new("", "test", campaignTarget, campaignEnd, author),
        "Title is required"
      );
    });

    it("should require description", async () => {
      await truffleAssertions.reverts(
        Campaign.new("test", "", campaignTarget, campaignEnd, author),
        "Description is required"
      );
    });

    it("should require target amount more than 0", async () => {
      await truffleAssertions.reverts(
        Campaign.new("test", "test", 0, campaignEnd, author),
        "Target amount greater thatn 0 is required"
      );
    });

    it("should require end to be in the future", async () => {
      const pastTime = (await time.latest()) - 100;
      await truffleAssertions.reverts(
        Campaign.new("test", "test", campaignTarget, pastTime, author),
        "End timestamp must be in the future"
      );
    });

    it("should require author address", async () => {
      await truffleAssertions.reverts(
        Campaign.new("test", "test", campaignTarget, campaignEnd, ZERO_ADDRESS),
        "Author address is required"
      );
    });
  });

  context("Donations", () => {
    it("should not allow donations after ending", async () => {
      await time.increase(time.duration.days(2));
      await truffleAssertions.reverts(
        campaign.donate({
          value: 1000,
          from: donor,
        }),
        "Expired"
      );
    });

    it("should not allow donations when fulfilled", async () => {
      // fulfils the target
      await campaign.donate({
        value: campaignTarget,
        from: donor,
      });

      await truffleAssertions.reverts(
        campaign.donate({
          value: 100,
          from: donor2,
        }),
        "Fulfilled"
      );
    });

    it("should require donation value more than 0", async () => {
      await truffleAssertions.reverts(
        campaign.donate({
          value: 0,
          from: donor,
        }),
        "Insufficient amount"
      );
    });

    it("should make users who donate donors", async () => {
      await campaign.donate({
        value: 1000,
        from: donor,
      });

      const isDonor = await campaign.isDonor(donor);

      assert.ok(isDonor);
    });

    it("should record how much users donated", async () => {
      await campaign.donate({
        value: 1000,
        from: donor,
      });
      await campaign.donate({
        value: 500,
        from: donor,
      });

      const donatedAmount = await campaign.donorsAmounts(donor);
      assert.equal(1500, donatedAmount.toNumber());
    });

    it("should count unique donors", async () => {
      await campaign.donate({
        value: 1000,
        from: donor,
      });
      await campaign.donate({
        value: 1000,
        from: donor,
      });
      await campaign.donate({
        value: 500,
        from: donor2,
      });

      const donorCount = await campaign.getDonorsCount();

      assert.equal(2, donorCount.toNumber());
    });
  });

  context("Refunds", () => {
    it("should process refunds correctly", async () => {
      await campaign.donate({
        value: 1000,
        from: donor,
      });
      await time.increase(time.duration.days(2));

      const donorInitialBalance = await web3.eth.getBalance(donor);
      const refundTx = await campaign.claimRefund({ from: donor });
      const donorFinalBalance = await web3.eth.getBalance(donor);
      const refundTxCost = await getTxCost(refundTx);

      assert.deepEqual(
        toBN(donorInitialBalance),
        toBN(donorFinalBalance).sub(toBN(1000)).add(refundTxCost)
      );
    });

    it("should not process refunds to to non-donors", async () => {
      await truffleAssertions.reverts(
        campaign.claimRefund({ from: donor }),
        "Not a donor"
      );
    });

    it("should not allow refund if campaign is active", async () => {
      await campaign.donate({
        value: 1000,
        from: donor,
      });

      await truffleAssertions.reverts(
        campaign.claimRefund({ from: donor }),
        "Active campaign"
      );
    });

    it("should not allow refund if campaign is fulfilled", async () => {
      // fulfils the target
      await campaign.donate({
        value: campaignTarget,
        from: donor,
      });
      await time.increase(time.duration.days(2));

      await truffleAssertions.reverts(
        campaign.claimRefund({ from: donor }),
        "Fulfilled"
      );
    });

    it("should allow donor claiming a refund only once", async () => {
      await campaign.donate({
        value: 1000,
        from: donor,
      });
      await time.increase(time.duration.days(2));

      await campaign.claimRefund({ from: donor });

      await truffleAssertions.reverts(
        campaign.claimRefund({ from: donor }),
        "Not a donor"
      );
    });
  });

  context("Payout", () => {
    const beneficiaryAmount = 10000;

    beforeEach("setup beneficary repo for each test", async () => {
      const beneficiaryRepoAddress = await campaign.beneficiaryRepo();
      const beneficiaryRepo = await BeneficiaryRepository.at(
        beneficiaryRepoAddress
      );
      await beneficiaryRepo.addBeneficiary(
        "test",
        "test",
        beneficiaryAmount,
        beneficiary
      );
    });

    it("should pay beneficiaries correctly", async () => {
      // fulfils the target
      await campaign.donate({
        value: campaignTarget,
        from: donor,
      });
      await time.increase(time.duration.days(2));

      const beneficiaryInitialBalance = await web3.eth.getBalance(beneficiary);
      const claimFundsTx = await campaign.claimFunds({ from: beneficiary });
      const claimFundsTxCost = await getTxCost(claimFundsTx);
      const beneficiaryFinalBalance = await web3.eth.getBalance(beneficiary);

      assert.deepEqual(
        toBN(beneficiaryInitialBalance),
        toBN(beneficiaryFinalBalance)
          .sub(toBN(beneficiaryAmount))
          .add(claimFundsTxCost)
      );
    });

    it("shot not pay beneficiaries until campaign fulfilled", async () => {
      await truffleAssertions.reverts(
        campaign.claimFunds({ from: beneficiary }),
        "Unfulfilled"
      );
    });

    it("should not pay funds to non-beneficiaries", async () => {
      await truffleAssertions.reverts(
        campaign.claimFunds({ from: donor }),
        "Not a beneficiary"
      );
    });
  });
});
