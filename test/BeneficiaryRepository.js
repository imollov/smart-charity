const BeneficiaryRepository = artifacts.require("BeneficiaryRepository.sol");
const Campaign = artifacts.require("Campaign");
const ChangeBallot = artifacts.require("ChangeBallot");

const truffleAssert = require("truffle-assertions");
const { time } = require("openzeppelin-test-helpers");
const { nextDayInSec } = require("./utils/time");
const { ZERO_ADDRESS } = require("./utils/constants");

contract(
  "BeneficiaryRepository",
  ([author, beneficiary, beneficiary2, donor]) => {
    let beneficiaryRepository;
    let campaign;

    beforeEach("setup contract for each test", async () => {
      const nextDay = await nextDayInSec();
      campaign = await Campaign.new("test", "test", 10000, nextDay, author);

      const campaignRepoAddr = await campaign.beneficiaryRepo();
      beneficiaryRepository = await BeneficiaryRepository.at(campaignRepoAddr);

      await beneficiaryRepository.addBeneficiary(
        "test",
        "test",
        10000,
        beneficiary
      );
    });

    context("Add beneficiery", () => {
      it("should set beneficiary data correctly", async () => {
        const beneficiaryAddresses = await beneficiaryRepository.getBeneficiaryAddresses();
        const {
          0: name,
          1: description,
          2: amount,
        } = await beneficiaryRepository.getBeneficiaryByAddress(beneficiary);

        assert.include(beneficiaryAddresses, beneficiary);
        assert.equal(name, "test");
        assert.equal(description, "test");
        assert.equal(amount.toNumber(), 10000);
      });

      it("should not allow adding beneficiaries when threre are donors", async () => {
        campaign.donate({
          value: 1000,
          from: donor,
        });
        await truffleAssert.reverts(
          beneficiaryRepository.addBeneficiary(
            "test",
            "test",
            10000,
            beneficiary2
          ),
          "Already have donors"
        );
      });

      it("should make a valid beneficiary", async () => {
        const isValidBeneficiary = await beneficiaryRepository.isValidBeneficiary(
          beneficiary
        );

        assert.ok(isValidBeneficiary);
      });

      it("should require beneficiary name", async () => {
        await truffleAssert.reverts(
          beneficiaryRepository.addBeneficiary("", "test", 10000, beneficiary2),
          "Name is required"
        );
      });

      it("should require beneficiary reason", async () => {
        await truffleAssert.reverts(
          beneficiaryRepository.addBeneficiary("test", "", 10000, beneficiary2),
          "Reason is required"
        );
      });

      it("should require beneficiary amount to be more than 0", async () => {
        await truffleAssert.reverts(
          beneficiaryRepository.addBeneficiary("test", "test", 0, beneficiary2),
          "Amount greater than 0 is required"
        );
      });

      it("should require beneficiary address to be valid", async () => {
        await truffleAssert.reverts(
          beneficiaryRepository.addBeneficiary(
            "test",
            "test",
            10000,
            ZERO_ADDRESS
          ),
          "Address is required"
        );
      });

      it("should allow only campaign author to add beneficiaries", async () => {
        await truffleAssert.reverts(
          beneficiaryRepository.addBeneficiary(
            "test",
            "test",
            10000,
            ZERO_ADDRESS,
            { from: donor }
          ),
          "Restricted access"
        );
      });
    });

    context("Request change", () => {
      beforeEach("setup change request for each test", async () => {
        campaign.donate({
          value: 1000,
          from: donor,
        });
        await beneficiaryRepository.addPendingBeneficiary(
          "test2",
          "test2",
          10000,
          beneficiary2
        );
        const ballotEnd = await nextDayInSec();
        await beneficiaryRepository.requestBeneficiaryChange(
          beneficiary,
          beneficiary2,
          "test",
          ballotEnd
        );
      });

      it("should add pending beneficiary correctly", async () => {
        const {
          name,
          reason,
          amount,
        } = await beneficiaryRepository.pendingBeneficiaries(beneficiary2);

        assert.equal(name, "test2");
        assert.equal(reason, "test2");
        assert.equal(amount.toNumber(), 10000);
      });

      it("should request beneficiary change correctly", async () => {
        const {
          removeBeneficiary,
          addPendingBeneficiary,
          description,
          ballot,
        } = await beneficiaryRepository.changeRequests(0);

        assert.equal(removeBeneficiary, beneficiary);
        assert.equal(addPendingBeneficiary, beneficiary2);
        assert.equal(description, "test");
        assert.ok(ballot);
      });

      it("should request adding new beneficiary", async () => {
        const ballotEnd = await nextDayInSec();
        await beneficiaryRepository.requestBeneficiaryChange(
          ZERO_ADDRESS,
          beneficiary2,
          "test",
          ballotEnd
        );

        const {
          removeBeneficiary,
          addPendingBeneficiary,
          description,
          ballot,
        } = await beneficiaryRepository.changeRequests(1);

        assert.equal(removeBeneficiary, ZERO_ADDRESS);
        assert.equal(addPendingBeneficiary, beneficiary2);
        assert.equal(description, "test");
        assert.ok(ballot);
      });

      it("should request removing beneficiary", async () => {
        const ballotEnd = await nextDayInSec();
        await beneficiaryRepository.requestBeneficiaryChange(
          beneficiary,
          ZERO_ADDRESS,
          "test",
          ballotEnd
        );

        const {
          removeBeneficiary,
          addPendingBeneficiary,
          description,
          ballot,
        } = await beneficiaryRepository.changeRequests(1);

        assert.equal(removeBeneficiary, beneficiary);
        assert.equal(addPendingBeneficiary, ZERO_ADDRESS);
        assert.equal(description, "test");
        assert.ok(ballot);
      });

      it("should require change description", async () => {
        const ballotEnd = await nextDayInSec();
        await truffleAssert.reverts(
          beneficiaryRepository.requestBeneficiaryChange(
            ZERO_ADDRESS,
            beneficiary2,
            "",
            ballotEnd
          ),
          "Description is required"
        );
      });

      it("should require ballot ends in the future", async () => {
        const ballotEnd = (await time.latest()) - 100;
        await truffleAssert.reverts(
          beneficiaryRepository.requestBeneficiaryChange(
            ZERO_ADDRESS,
            beneficiary2,
            "test",
            ballotEnd
          ),
          "Ballot end must be in the future"
        );
      });

      it("should allow only campaign author to add pending beneficiaries", async () => {
        await truffleAssert.reverts(
          beneficiaryRepository.addPendingBeneficiary(
            "test2",
            "test2",
            10000,
            beneficiary2,
            { from: donor }
          ),
          "Restricted access"
        );
      });

      it("should allow only campaign author to request changes", async () => {
        const ballotEnd = await nextDayInSec();
        await truffleAssert.reverts(
          beneficiaryRepository.requestBeneficiaryChange(
            beneficiary,
            beneficiary2,
            "test",
            ballotEnd,
            { from: donor }
          ),
          "Restricted access"
        );
      });

      context("Commit change", () => {
        it("should commit accepted beneficiary change", async () => {
          await campaign.donate({
            from: donor,
            value: 1000,
          });
          await time.increase(time.duration.days(2));

          await beneficiaryRepository.commitBeneficiaryChange(0);
          const beneficiaryAddresses = await beneficiaryRepository.getBeneficiaryAddresses();

          assert.include(beneficiaryAddresses, beneficiary2);
          assert.notInclude(beneficiaryAddresses, beneficiary);
        });

        it("should not commit change before ballot ends", async () => {
          await truffleAssert.reverts(
            beneficiaryRepository.commitBeneficiaryChange(0),
            "Ballot not finished yet"
          );
        });

        it("should not commit rejected change", async () => {
          await campaign.donate({
            from: donor,
            value: 1000,
          });
          const { ballot } = await beneficiaryRepository.changeRequests(0);
          const changeBallot = await ChangeBallot.at(ballot);
          await changeBallot.vote(false, { from: donor });

          await time.increase(time.duration.days(2));

          await truffleAssert.reverts(
            beneficiaryRepository.commitBeneficiaryChange(0),
            "Donors rejected request"
          );
        });

        it("should allow only campaign author to commit changes", async () => {
          await truffleAssert.reverts(
            beneficiaryRepository.commitBeneficiaryChange(0, { from: donor }),
            "Restricted access"
          );
        });
      });
    });
  }
);
