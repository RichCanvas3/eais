// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.23;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";

/// @title IIdentityRegistry (ERC-8004 reference)
/// @notice ERC-721-based agent identity registry + URIStorage + extra metadata
/// @dev agentId == ERC-721 tokenId
interface IIdentityRegistry is IERC165, IERC721, IERC721Metadata {
    // -----------------
    // Events (custom)
    // -----------------

    /// @notice Emitted when on-chain metadata is set for an agent
    event MetadataSet(uint256 indexed agentId, string indexed key, string value);

    /// @notice Emitted when a new agent is registered
    event Registered(uint256 indexed agentId, string tokenURI, address indexed owner);

    // -----------------
    // View helpers
    // -----------------

    /// @notice Returns the EVM chainId this registry is deployed on
    function registryChainId() external view returns (uint64);

    /// @notice Returns this registry's address (for convenience in clients)
    function identityRegistryAddress() external view returns (address);

    /// @notice Returns true if the token (agent) exists
    function exists(uint256 agentId) external view returns (bool);

    // -----------------
    // Minting (admin)
    // -----------------

    struct MetadataEntry { string key; string value; }

    /// @notice Register a new agent, set tokenURI and optional metadata entries
    function register(string calldata tokenURI, MetadataEntry[] calldata metadata) external returns (uint256 agentId);

    // -----------------
    // Token URI management (controller or operator)
    // -----------------

    /// @notice Update tokenURI; MUST point to the agent registration file (ipfs:// or https://)
    function setTokenURI(uint256 agentId, string calldata uri) external;

    // -----------------
    // On-chain metadata (optional extras)
    // -----------------

    /// @notice Set string metadata (key => value) for an agent
    function setMetadata(uint256 agentId, string calldata key, string calldata value) external;

    /// @notice Read a metadata value; empty string means not set
    function getMetadata(uint256 agentId, string calldata key) external view returns (string memory);
}
