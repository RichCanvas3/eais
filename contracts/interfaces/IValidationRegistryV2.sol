// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.23;

/// @title IValidationRegistry (ERC-8004 reference)
/// @notice Tracks agent validation requests and validator responses.
interface IValidationRegistry {
    // -------- Events --------

    /// @notice Emitted when an agent requests a validation
    event ValidationRequest(
        address indexed validatorAddress,
        uint256 indexed agentId,
        string  requestUri,
        bytes32 indexed requestHash
    );

    /// @notice Emitted when a validator posts/updates a response
    event ValidationResponse(
        address indexed validatorAddress,
        uint256 indexed agentId,
        bytes32 indexed requestHash,
        uint8   response,      // 0..100
        string  responseUri,   // optional evidence
        bytes32 tag            // optional categorization
    );

    // -------- Write API --------

    /// @notice Agent owner/operator opens a validation request
    /// @param validatorAddress The validator smart contract/account expected to respond
    /// @param agentId          Identity Registry tokenId
    /// @param requestUri       Off-chain request payload (IPFS/HTTPS)
    /// @param requestHash      Commitment to request payload (optional if IPFS, but recommended)
    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestUri,
        bytes32 requestHash
    ) external;

    /// @notice Validator posts (or updates) the validation result
    /// @param requestHash   The request identifier (commitment)
    /// @param response      0..100 (binary or graded)
    /// @param responseUri   Optional evidence/details (IPFS/HTTPS)
    /// @param responseHash  Optional commitment to response payload
    /// @param tag           Optional tag/category (e.g., "soft", "hard")
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseUri,
        bytes32 responseHash,
        bytes32 tag
    ) external;

    // -------- Read API --------

    /// @notice Returns latest status for a request
    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (
            address validatorAddress,
            uint256 agentId,
            uint8 response,
            bytes32 tag,
            uint256 lastUpdate
        );

    /// @notice Aggregated summary for an agent (optionally filter by validators and/or tag)
    function getSummary(
        uint256 agentId,
        address[] calldata validatorAddresses,
        bytes32 tag
    ) external view returns (uint64 count, uint8 avgResponse);

    /// @notice All request hashes for an agent
    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory);

    /// @notice All request hashes ever addressed to a validator
    function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory);

    // -------- Binding to Identity Registry --------

    /// @notice The bound Identity Registry (chainId + contract address)
    function getIdentityRegistry() external view returns (uint64 chainId, address identityRegistry);
}
