// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.23;

import {IValidationRegistry} from "./interfaces/IValidationRegistryV2.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistryV2.sol";

/// @title ValidationRegistry (ERC-8004 reference)
/// @notice Agents request validation; designated validators post responses.
/// @dev Bound to a single Identity Registry (chainId + address).
contract ValidationRegistry is IValidationRegistry {
    // ---------- Config: bound Identity Registry ----------
    IIdentityRegistry private immutable _idRegistry;
    uint64 private immutable _chainId;

    constructor(address identityRegistry) {
        require(identityRegistry != address(0), "idRegistry=0");
        _idRegistry = IIdentityRegistry(identityRegistry);
        _chainId = _idRegistry.registryChainId();
        require(_chainId == uint64(block.chainid), "chainId mismatch");
        require(_idRegistry.identityRegistryAddress() == identityRegistry, "reg addr mismatch");
    }

    // ---------- Storage ----------

    struct RequestMeta {
        address validator;      // who is allowed to respond
        uint256 agentId;        // which agent requested this
        bool    exists;         // request created
    }

    struct Status {
        uint8   response;       // 0..100 (latest)
        bytes32 tag;            // optional latest tag
        uint256 lastUpdate;     // timestamp of last response
        string  responseUri;    // latest evidence (optional)
        bytes32 responseHash;   // commitment to latest evidence (optional)
    }

    // requestHash => request meta
    mapping(bytes32 => RequestMeta) private _requests;

    // requestHash => latest status
    mapping(bytes32 => Status) private _status;

    // agentId => list of requestHashes
    mapping(uint256 => bytes32[]) private _agentRequests;

    // validator => list of requestHashes
    mapping(address => bytes32[]) private _validatorRequests;

    // -------- Write API --------

    /// @inheritdoc IValidationRegistry
    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestUri,
        bytes32 requestHash
    ) external override {
        require(validatorAddress != address(0), "validator=0");
        require(_exists(agentId), "agent !exists");
        require(!_requests[requestHash].exists, "request exists");

        // Only the agent controller or its operator can open a request
        _requireOwnerOrOperator(agentId, msg.sender);

        // Record request meta
        _requests[requestHash] = RequestMeta({
            validator: validatorAddress,
            agentId: agentId,
            exists: true
        });

        // Indexes
        _agentRequests[agentId].push(requestHash);
        _validatorRequests[validatorAddress].push(requestHash);

        emit ValidationRequest(validatorAddress, agentId, requestUri, requestHash);
    }

    /// @inheritdoc IValidationRegistry
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseUri,
        bytes32 responseHash,
        bytes32 tag
    ) external override {
        require(response <= 100, "response>100");
        RequestMeta memory req = _requests[requestHash];
        require(req.exists, "unknown request");
        require(msg.sender == req.validator, "only validator");

        // Update latest status (idempotent; allows progressive states)
        _status[requestHash] = Status({
            response: response,
            tag: tag,
            lastUpdate: block.timestamp,
            responseUri: responseUri,
            responseHash: responseHash
        });

        emit ValidationResponse(req.validator, req.agentId, requestHash, response, responseUri, tag);
    }

    // -------- Read API --------

    /// @inheritdoc IValidationRegistry
    function getValidationStatus(bytes32 requestHash)
        external
        view
        override
        returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 tag, uint256 lastUpdate)
    {
        RequestMeta memory req = _requests[requestHash];
        require(req.exists, "unknown request");
        Status memory st = _status[requestHash];
        return (req.validator, req.agentId, st.response, st.tag, st.lastUpdate);
    }

    /// @inheritdoc IValidationRegistry
    function getSummary(
        uint256 agentId,
        address[] calldata validatorAddresses,
        bytes32 tag
    ) external view override returns (uint64 count, uint8 avgResponse) {
        require(_exists(agentId), "agent !exists");
        bytes32[] storage hashes = _agentRequests[agentId];
        uint256 sum = 0;

        if (validatorAddresses.length == 0) {
            for (uint256 i = 0; i < hashes.length; i++) {
                Status storage st = _status[hashes[i]];
                if (st.lastUpdate == 0) continue; // no response yet
                if (tag != bytes32(0) && st.tag != tag) continue;
                sum += st.response;
                count += 1;
            }
        } else {
            // Build quick allowlist
            for (uint256 i = 0; i < hashes.length; i++) {
                RequestMeta storage req = _requests[hashes[i]];
                Status storage st = _status[hashes[i]];
                if (st.lastUpdate == 0) continue; // no response yet
                if (tag != bytes32(0) && st.tag != tag) continue;

                bool ok = false;
                for (uint256 j = 0; j < validatorAddresses.length; j++) {
                    if (req.validator == validatorAddresses[j]) { ok = true; break; }
                }
                if (!ok) continue;

                sum += st.response;
                count += 1;
            }
        }

        avgResponse = count == 0 ? 0 : uint8(sum / count);
    }

    /// @inheritdoc IValidationRegistry
    function getAgentValidations(uint256 agentId) external view override returns (bytes32[] memory) {
        require(_exists(agentId), "agent !exists");
        return _agentRequests[agentId];
    }

    /// @inheritdoc IValidationRegistry
    function getValidatorRequests(address validatorAddress) external view override returns (bytes32[] memory) {
        return _validatorRequests[validatorAddress];
    }

    /// @inheritdoc IValidationRegistry
    function getIdentityRegistry() external view override returns (uint64, address) {
        return (_chainId, address(_idRegistry));
    }

    // -------- Internal helpers --------

    function _exists(uint256 agentId) internal view returns (bool) {
        // IERC721.ownerOf MUST revert if !exists, so we check with try/catch
        try _idRegistry.ownerOf(agentId) returns (address o) {
            return o != address(0);
        } catch {
            return false;
        }
    }

    function _requireOwnerOrOperator(uint256 agentId, address caller) internal view {
        address owner = _idRegistry.ownerOf(agentId);
        if (caller == owner) return;
        if (_idRegistry.getApproved(agentId) == caller) return;
        if (_idRegistry.isApprovedForAll(owner, caller)) return;
        revert("not owner/operator");
    }
}
