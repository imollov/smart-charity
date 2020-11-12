pragma solidity >=0.4.22 <0.7.0;

import "./Campaign.sol";

contract ChangeBallot {
    struct Voter {
        bool option;
        bool voted;
    }

    event LogInitializeBallot(
        address indexed _campaign,
        uint256 indexed _timestamp
    );

    event LogVote(
        bool indexed _option,
        uint256 indexed _timestamp
    );

    uint256 public endTimestamp;
    address[] public voterIndices;
    mapping(address => Voter) public voters;
    Campaign public campaign;

    constructor(uint256 _endTimestamp, address _campaign)
        public 
    {
        endTimestamp = _endTimestamp;
        campaign = Campaign(_campaign);

        emit LogInitializeBallot(_campaign, block.timestamp);
    }

    function vote(bool _option)
        public
    {
        require(!hasFinished(), "Expired");
        require(campaign.isDonor(msg.sender), "Not eligible to vote");
        require(!voters[msg.sender].voted, "Already voted");

        voterIndices.push(msg.sender);
        voters[msg.sender] = Voter({option: _option, voted: true});

        emit LogVote(_option, block.timestamp);
    }

    function hasFinished()
        public
        view
        returns (bool) 
    {
        return now > endTimestamp;
    }

    function getWinningOption()
        public
        view
        returns (bool)
    {
        // todo: add weight depending on donation size
        uint256 rejectedCount;
        for (uint256 i = 0; i < voterIndices.length; i++) {
            if (voters[voterIndices[i]].option == false) {
                rejectedCount += 1;
            }
        }
        uint256 donorsCount = campaign.getDonorsCount();
        uint256 acceptedCount = donorsCount - rejectedCount;
        return (acceptedCount / donorsCount) * 100 > 50;
    }
}
