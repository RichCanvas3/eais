// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.23;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistryV2.sol"; // reference the interface

contract IdentityRegistry is ERC721, ERC721URIStorage, Ownable, IIdentityRegistry {
    uint256 private _nextId;

    mapping(uint256 => mapping(bytes32 => bytes)) private _metadata;

    constructor(
        string memory name_,
        string memory symbol_
    ) ERC721(name_, symbol_) Ownable() {}

    // ----------
    // View helpers
    // ----------

    function registryChainId() external view override returns (uint64) {
        return uint64(block.chainid);
    }

    function identityRegistryAddress() external view override returns (address) {
        return address(this);
    }

    function exists(uint256 agentId) public view override returns (bool) {
        return _ownerOf(agentId) != address(0);
    }

    // ----------
    // Registration
    // ----------

    function register(string calldata tokenURI_, MetadataEntry[] calldata metadata)
        external
        override
        returns (uint256 agentId)
    {
        agentId = ++_nextId;
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, tokenURI_);

        // Optional metadata entries
        for (uint256 i = 0; i < metadata.length; i++) {
            bytes32 k = keccak256(bytes(metadata[i].key));
            _metadata[agentId][k] = bytes(metadata[i].value);
            emit MetadataSet(agentId, metadata[i].key, metadata[i].value);
        }

        emit Registered(agentId, tokenURI_, msg.sender);
    }

    // ----------
    // Token URI management (controller or operator)
    // ----------

    function setTokenURI(uint256 agentId, string calldata uri) external override {
        _requireControllerOrOperator(agentId);
        _setTokenURI(agentId, uri);
    }

    // ----------
    // On-chain metadata (string)
    // ----------

    function setMetadata(
        uint256 agentId,
        string calldata key,
        string calldata value
    ) external override {
        _requireControllerOrOperator(agentId);
        bytes32 k = keccak256(bytes(key));
        _metadata[agentId][k] = bytes(value);
        emit MetadataSet(agentId, key, value);
    }

    function getMetadata(uint256 agentId, string calldata key)
        external
        view
        override
        returns (string memory)
    {
        bytes32 k = keccak256(bytes(key));
        bytes memory v = _metadata[agentId][k];
        return string(v);
    }

    // ----------
    // Internal
    // ----------

    function _requireControllerOrOperator(uint256 agentId) internal view {
        address owner = ownerOf(agentId);
        require(
            msg.sender == owner ||
                getApproved(agentId) == msg.sender ||
                isApprovedForAll(owner, msg.sender),
            "not controller or operator"
        );
    }

    // ----------
    // Overrides (ERC721 + URIStorage)
    // ----------

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage, IERC721Metadata)
        returns (string memory)
    {
        return ERC721URIStorage.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, IERC165)
        returns (bool)
    {
        return
            interfaceId == type(IIdentityRegistry).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
