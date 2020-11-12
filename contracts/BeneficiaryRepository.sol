pragma solidity >=0.4.22 <0.7.0;

import "./Campaign.sol";
import "./ChangeBallot.sol";

contract BeneficiaryRepository {
    struct Beneficiary {
        string name;
        string reason;
        uint256 amount;
    }

    struct ChangeRequest {
        address removeBeneficiary;
        address addPendingBeneficiary;
        string description;
        address ballot;
    }

    event LogAddBeneficiary(
        address indexed _address,
        uint256 indexed _timestamp
    );

    event LogAddPendingBeneficiary(
        address indexed _address,
        uint256 indexed _timestamp
    );

    event LogRequestBeneficiaryChange(
        address indexed _removeBeneficiary,
        address indexed _addPendingBeneficiary,
        uint256 indexed _timestamp
    );

    event LogCommitBeneficiaryChange(
        address indexed _removeBeneficiary,
        address indexed _addPendingBeneficiary,
        uint256 indexed _timestamp
    );

    address[] public beneficiaryIndices;
    mapping(address => Beneficiary) public beneficieries;
    mapping(address => Beneficiary) public pendingBeneficiaries;
    ChangeRequest[] public changeRequests;
    Campaign public campaign;

    modifier isAuthor() {
        require(msg.sender == campaign.author(), "Restricted access");
        _;
    }

    constructor()
        public
    {
        campaign = Campaign(msg.sender);
    }

    function addBeneficiary(
        string memory _name,
        string memory _reason,
        uint256 _amount,
        address _address
    ) 
        public
        isAuthor
    {
        require(campaign.getDonorsCount() == 0, "Already have donors. Propose a new change.");
        requireBeneficiaryData(_name, _reason, _amount, _address);
        // todo: check if amount not exceeding target

        beneficiaryIndices.push(_address);
        beneficieries[_address] = Beneficiary({
            name: _name,
            reason: _reason,
            amount: _amount
        });

        emit LogAddBeneficiary(_address, block.timestamp);
    }

    function addPendingBeneficiary(
        string memory _name,
        string memory _reason,
        uint256 _amount,
        address _address
    )
        public
        isAuthor
    {
        requireBeneficiaryData(_name, _reason, _amount, _address);

        pendingBeneficiaries[_address] = Beneficiary({
            name: _name,
            reason: _reason,
            amount: _amount
        });

        emit LogAddPendingBeneficiary(_address, block.timestamp);
    }

    function requireBeneficiaryData(
        string memory _name,
        string memory _reason,
        uint256 _amount,
        address _address
    )
        internal
        pure
    {
        require(bytes(_name).length > 0, "Name is required");
        require(bytes(_reason).length > 0, "Reason is required");
        require(_amount > 0, "Amount greater than 0 is required");
        require(_address != address(0), "Address is required");
    }

    function requestBeneficiaryChange(
        address _removeBeneficiary,
        address _addPendingBeneficiary,
        string memory _description,
        uint256 _ballotEndTimestamp
    )
        public
        isAuthor
    {
        require(campaign.getDonorsCount() > 0, "Campaign must have at least one donor");
        require(bytes(_description).length > 0, "Description is required");
        require(_ballotEndTimestamp > now, "Ballot end must be in the future");
        // todo: check if the new amount will exceed the target

        address ballot = address(new ChangeBallot(_ballotEndTimestamp, address(campaign)));

        changeRequests.push(
            ChangeRequest({
                removeBeneficiary: _removeBeneficiary,
                addPendingBeneficiary: _addPendingBeneficiary,
                description: _description,
                ballot: ballot
            })
        );

        emit LogRequestBeneficiaryChange(
            _removeBeneficiary,
            _addPendingBeneficiary,
            block.timestamp
        );
    }

    function commitBeneficiaryChange(uint256 _index)
        public
        isAuthor
    {
        ChangeRequest storage request = changeRequests[_index];
        ChangeBallot ballot = ChangeBallot(request.ballot);

        require(ballot.hasFinished(), "Ballot not finished yet");
        require(ballot.getWinningOption(), "Donors rejected request");

        if (request.removeBeneficiary != address(0)) {
            removeBeneficiary(request.removeBeneficiary);
        }
        if (request.addPendingBeneficiary != address(0)) {
            addRequestedBeneficiary(request.addPendingBeneficiary);
            removePendingBeneficiary(request.addPendingBeneficiary);
        }

        emit LogCommitBeneficiaryChange(
            request.removeBeneficiary,
            request.addPendingBeneficiary,
            block.timestamp
        );
    }

    function removeBeneficiary(address _address)
        internal
    {
        delete beneficieries[_address];

        for (uint256 i = 0; i < beneficiaryIndices.length; i++) {
            if (beneficiaryIndices[i] == _address) {
                delete beneficiaryIndices[i];
                break;
            }
        }
    }

    function addRequestedBeneficiary(address _address)
        internal
    {
        Beneficiary storage pendingBeneficiary = pendingBeneficiaries[_address];
        beneficiaryIndices.push(_address);
        beneficieries[_address] = pendingBeneficiary;
    }

    function removePendingBeneficiary(address _address)
        internal
    {
        delete pendingBeneficiaries[_address];
    }

    function isValidBeneficiary(address _address)
        public
        view
        returns (bool)
    {
        return beneficieries[_address].amount > 0;
    }

    function getBeneficiaryAddresses()
        public
        view
        returns (address[] memory) 
    {
        return beneficiaryIndices;
    }

    function getBeneficiaryByAddress(address _address)
        public
        view
        returns (string memory, string memory, uint256)
    {
        Beneficiary storage beneficiary = beneficieries[_address];
        return (beneficiary.name, beneficiary.reason, beneficiary.amount);
    }
}
