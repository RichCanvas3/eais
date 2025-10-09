// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.23;

/// @notice Minimal surface for an ERC-8004-like Reputation Registry
/// @dev This registry is bound to one Identity Registry and chainId.
interface IReputationRegistry {
    // -------- Events --------

    /// @notice Emitted when new feedback is recorded
    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint8   score,
        bytes32 indexed tag1,
        bytes32 tag2,
        string  fileuri,
        bytes32 filehash
    );

    /// @notice Emitted when feedback at index is revoked by the original client
    event FeedbackRevoked(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64  indexed feedbackIndex
    );

    /// @notice Emitted when anyone appends a response/evidence to a feedback entry
    event ResponseAppended(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64  indexed feedbackIndex,
        address responder,
        string  responseUri
    );

    // -------- Write API --------

    /// @notice Add feedback authorized by the agent (owner/operator)
    /// @param agentId Agent (Identity Registry tokenId)
    /// @param score   0..100
    /// @param tag1    Optional indexed tag
    /// @param tag2    Optional tag
    /// @param fileuri Optional off-chain JSON (IPFS/HTTPS)
    /// @param filehash Optional SHA-256 hash of file content (omit for IPFS URIs)
    /// @param feedbackAuth Authorization bytes produced by agent owner/operator
    function giveFeedback(
        uint256 agentId,
        uint8 score,
        bytes32 tag1,
        bytes32 tag2,
        string calldata fileuri,
        bytes32 filehash,
        bytes calldata feedbackAuth
    ) external;

    /// @notice Revoke a previously submitted feedback (by same clientAddress)
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external;

    /// @notice Append a response/evidence to an existing feedback entry
    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseUri,
        bytes32 responseHash
    ) external;

    // -------- Read API --------

    /// @dev Return (count, averageScore) filtered by optional clientAddresses and tags
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        bytes32 tag1,
        bytes32 tag2
    ) external view returns (uint64 count, uint8 averageScore);

    /// @dev Return one feedback entry tuple
    function readFeedback(
        uint256 agentId,
        address clientAddress,
        uint64 index
    ) external view returns (uint8 score, bytes32 tag1, bytes32 tag2, bool isRevoked);

    /// @dev Bulk read; use includeRevoked to include revoked entries
    function readAllFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        bytes32 tag1,
        bytes32 tag2,
        bool includeRevoked
    ) external view returns (
        address[] memory outClients,
        uint8[]    memory scores,
        bytes32[]  memory tag1s,
        bytes32[]  memory tag2s,
        bool[]     memory revokedStatuses
    );

    /// @dev Count responses for a feedback entry from a subset of responders (sum)
    function getResponseCount(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        address[] calldata responders
    ) external view returns (uint64);

    /// @dev Return all client addresses that ever left feedback for agentId
    function getClients(uint256 agentId) external view returns (address[] memory);

    /// @dev Return last feedback index for (agentId, clientAddress), or ~0 if none
    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64);

    // -------- Binding to Identity Registry --------

    /// @notice The bound Identity Registry (chainId + contract address)
    function getIdentityRegistry() external view returns (address identityRegistry);
}
