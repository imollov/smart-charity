const ChangeBallot = artifacts.require("ChangeBallot");
const Campaign = artifacts.require("Campaign");

const truffleAssert = require("truffle-assertions");
const { time } = require("openzeppelin-test-helpers");
const { nextDayInSec } = require("./utils/time");

contract("ChangeBallot", ([author, donor, donor2, notDonor]) => {
  let changeBallot;

  beforeEach("setup contract for each test", async () => {
    const nextDay = await nextDayInSec();
    campaign = await Campaign.new("test", "test", 10000, nextDay, author);
    await Promise.all([
      campaign.donate({ value: 1000, from: donor }),
      campaign.donate({ value: 1000, from: donor2 }),
    ]);

    changeBallot = await ChangeBallot.new(nextDay, campaign.address);
  });

  context("Voting", () => {
    it("should allow only donors to vote", async () => {
      await truffleAssert.reverts(
        changeBallot.vote(false, { from: notDonor }),
        "Not eligible to vote"
      );
    });

    it("should allow voting once", async () => {
      await changeBallot.vote(false, { from: donor });

      await truffleAssert.reverts(
        changeBallot.vote(false, { from: donor }),
        "Already voted"
      );
    });

    it("should count votes", async () => {
      await changeBallot.vote(false, { from: donor });

      const voterAddr = await changeBallot.voterIndices(0);

      assert.equal(voterAddr, donor);
    });

    it("should not allow voting once finished", async () => {
      await time.increase(time.duration.days(2));

      await truffleAssert.reverts(
        changeBallot.vote(false, { from: donor }),
        "Expired"
      );
    });
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
      await Promise.all([
        changeBallot.vote(false, { from: donor }),
        changeBallot.vote(false, { from: donor2 }),
      ]);

      const winningOption = await changeBallot.getWinningOption();

      assert.strictEqual(winningOption, false);
    });

    it("should have positive outcome if more than 50% accept", async () => {
      await Promise.all([
        changeBallot.vote(true, { from: donor }),
        changeBallot.vote(true, { from: donor2 }),
      ]);

      const winningOption = await changeBallot.getWinningOption();

      assert.strictEqual(winningOption, true);
    });
  });
});
