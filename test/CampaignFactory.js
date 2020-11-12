const CampaignFactory = artifacts.require("CampaignFactory");
const Campaign = artifacts.require("Campaign");

const truffleAssert = require("truffle-assertions");
const { nextDayInSec } = require("./utils/time");

contract("CampaignFactory", ([caller]) => {
  let campaignFactory;
  let createCampaignResult;
  let deployedCampaigns;
  let campaignEnd;

  beforeEach(
    "setup contract and create new campaign for each test",
    async () => {
      campaignFactory = await CampaignFactory.new();
      campaignEnd = await nextDayInSec();
      createCampaignResult = await campaignFactory.createCampaign(
        "test",
        "test",
        10000,
        campaignEnd
      );
      deployedCampaigns = await campaignFactory.getDeployedCampaigns();
    }
  );

  it("should deploy a new campaign", async () => {
    truffleAssert.eventEmitted(
      createCampaignResult,
      "LogCreateCampaign",
      (event) => {
        assert.equal(
          event._campaignAddress,
          deployedCampaigns[0],
          "Unable to deploy new campaign"
        );
        return true;
      }
    );
  });

  it("should create campaign with correct data", async () => {
    const campaign = await Campaign.at(deployedCampaigns[0]);
    const [
      author,
      title,
      description,
      targetAmount,
      endTimestamp,
    ] = await Promise.all([
      campaign.author(),
      campaign.title(),
      campaign.description(),
      campaign.targetAmount(),
      campaign.endTimestamp(),
    ]);

    assert(author, caller);
    assert("test", title);
    assert("test", description);
    assert(10000, targetAmount);
    assert(campaignEnd, endTimestamp);
  });
});
