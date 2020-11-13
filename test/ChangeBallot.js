const ChangeBallot = artifacts.require("ChangeBallot");
const Campaign = artifacts.require("Campaign");

const { time } = require("openzeppelin-test-helpers");
const { nextDayInSec } = require("./utils/time");
const assertRevert = require("./utils/assertRevert");

contract("ChangeBallot", ([author, donor, donor2, notDonor]) => {
  let changeBallot;
  const campaignTarget = 1000;

  before(async () => {
    campaignEnd = await nextDayInSec();
    campaign = await Campaign.new(
      "test",
      "test",
      campaignTarget,
      campaignEnd,
      author
    );
    await Promise.all([
      campaign.donate({ value: 100, from: donor }),
      campaign.donate({ value: 100, from: donor2 }),
    ]);

    changeBallot = await ChangeBallot.new(campaignEnd, campaign.address);
  });

  context("Deciding winner", () => {
    it("should have positive outcome if nobody votes", async () => {
      const winningOption = await changeBallot.getWinningOption();
      assert.strictEqual(winningOption, true);
    });

    it("should have negative outcome if there's no majority", async () => {
      await changeBallot.vote(false, { from: donor });
      const winningOption = await changeBallot.getWinningOption();
      assert.strictEqual(winningOption, false);
    });

    it("should have negative outcome if more than 50% reject", async () => {
      await changeBallot.vote(false, { from: donor2 });
      const winningOption = await changeBallot.getWinningOption();
      assert.strictEqual(winningOption, false);
    });

    it("should have positive outcome if more than 50% accept", async () => {
      campaignEnd = await nextDayInSec();
      changeBallot = await ChangeBallot.new(campaignEnd, campaign.address);
      await Promise.all([
        changeBallot.vote(true, { from: donor }),
        changeBallot.vote(true, { from: donor2 }),
      ]);

      const winningOption = await changeBallot.getWinningOption();

      assert.strictEqual(winningOption, true);
    });
  });

  context("Voting", () => {
    it("should allow only donors to vote", async () => {
      await assertRevert(
        changeBallot.vote(false, { from: notDonor }),
        "Not eligible to vote"
      );
    });

    it("should allow voting once", async () => {
      await assertRevert(
        changeBallot.vote(false, { from: donor }),
        "Already voted"
      );
    });

    it("should count votes", async () => {
      const voterAddress = await changeBallot.voterIndices(0);
      assert.equal(voterAddress, donor);
    });

    it("should not allow voting once finished", async () => {
      await time.increase(time.duration.days(2));
      await assertRevert(changeBallot.vote(false, { from: donor }), "Expired");
    });
  });
});
