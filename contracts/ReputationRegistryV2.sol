// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.23;

import {IReputationRegistry} from "./interfaces/IReputationRegistryV2.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistryV2.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @title ReputationRegistry (ERC-8004 reference)
/// @notice Stores simple feedback signals (score/tags/uri) authorized by agents
/// @dev Bound to a single Identity Registry (chainId + address).
contract ReputationRegistry is IReputationRegistry {
    using ECDSA for bytes32;
    using EnumerableSet for EnumerableSet.AddressSet;

    // ---------- Config: bound Identity Registry ----------

    IIdentityRegistry private immutable _idRegistry;
    uint64 private immutable _chainId;

    constructor(address identityRegistry) {
        require(identityRegistry != address(0), "idRegistry=0");
        _idRegistry = IIdentityRegistry(identityRegistry);
        _chainId = _idRegistry.registryChainId();
        // Defensive: ensure on this chain
        require(_chainId == uint64(block.chainid), "chainId mismatch");
        require(_idRegistry.identityRegistryAddress() == identityRegistry, "reg addr mismatch");
    }

    // ---------- Storage ----------

    struct Feedback {
        uint8 score;       // 0..100
        bytes32 tag1;      // optional filter tag
        bytes32 tag2;      // optional filter tag
        bool revoked;      // true if revoked by client
    }

    // agentId => client => list of feedback
    mapping(uint256 => mapping(address => Feedback[])) private _feedback;

    // agentId => set of clients who have ever left feedback
    mapping(uint256 => EnumerableSet.AddressSet) private _clients;

    // agentId => client => responder => responseCount
    mapping(uint256 => mapping(address => mapping(uint64 => mapping(address => uint64)))) private _responseCount;

    // ---------- EIP-191 domain/tag ----------

    // keccak256("ERC8004-FeedbackAuth")
    bytes32 private constant FEEDBACK_DOMAIN = 0x7f8a2c3b4d9f3e0c1b0d1a29e5a2f6ac2a9f2a0c4c3a2b195e4c2aee2a9f7f60;

    // ---------- External: write ----------

    /// @inheritdoc IReputationRegistry
    function giveFeedback(
        uint256 agentId,
        uint8 score,
        bytes32 tag1,
        bytes32 tag2,
        string calldata fileuri,
        bytes32 filehash,
        bytes calldata feedbackAuth
    ) external override {
        require(score <= 100, "score>100");
        require(_exists(agentId), "agent !exists");

        // Decode feedbackAuth:
        // abi.encode(
        //   uint256 agentId,
        //   address clientAddress,
        //   uint64 indexLimit,
        //   uint64 expiry,
        //   uint64 chainId,
        //   address identityRegistry,
        //   address signer,          // owner or operator
        //   bytes   signature        // EOA or ERC-1271 signature over authHash
        // )
        (
            uint256 authAgentId,
            address clientAddress,
            uint64 indexLimit,
            uint64 expiry,
            uint64 authChainId,
            address authIdentityRegistry,
            address signer,
            bytes memory signature
        ) = _decodeAuth(feedbackAuth);

        require(authAgentId == agentId, "auth agentId mismatch");
        require(clientAddress == msg.sender, "client != msg.sender");
        require(block.timestamp < expiry, "auth expired");
        require(authChainId == _chainId, "chainId mismatch");
        require(authIdentityRegistry == address(_idRegistry), "idRegistry mismatch");

        // Ensure indexLimit authorizes this new index (indexLimit ≥ nextIndex)
        uint64 nextIndex = uint64(_feedback[agentId][clientAddress].length);
        require(indexLimit >= nextIndex, "indexLimit too low");

        // Verify signer is owner/operator of agentId
        _requireOwnerOrOperator(agentId, signer);

        // Verify signature (EOA or 1271) over domain-separated hash
        bytes32 authHash = _feedbackAuthHash(agentId, clientAddress, indexLimit, expiry, authChainId, authIdentityRegistry, signer);
        _verifySignatureFlexible(signer, authHash, signature);

        // Store feedback
        _feedback[agentId][clientAddress].push(Feedback({
            score: score,
            tag1: tag1,
            tag2: tag2,
            revoked: false
        }));

        // Track client set
        _clients[agentId].add(clientAddress);

        emit NewFeedback(agentId, clientAddress, score, tag1, tag2, fileuri, filehash);
    }

    /// @inheritdoc IReputationRegistry
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external override {
        require(_exists(agentId), "agent !exists");
        require(feedbackIndex < _feedback[agentId][msg.sender].length, "index OOB");
        Feedback storage fb = _feedback[agentId][msg.sender][feedbackIndex];
        require(!fb.revoked, "already revoked");
        fb.revoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    /// @inheritdoc IReputationRegistry
    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseUri,
        bytes32 responseHash
    ) external override {
        require(_exists(agentId), "agent !exists");
        require(feedbackIndex < _feedback[agentId][clientAddress].length, "index OOB");
        // Bump responder count
        _responseCount[agentId][clientAddress][feedbackIndex][msg.sender] += 1;
        emit ResponseAppended(agentId, clientAddress, feedbackIndex, msg.sender, responseUri);
    }

    // ---------- External: read ----------

    /// @inheritdoc IReputationRegistry
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        bytes32 tag1,
        bytes32 tag2
    ) external view override returns (uint64 count, uint8 averageScore) {
        require(_exists(agentId), "agent !exists");
        uint256 sum = 0;
        if (clientAddresses.length == 0) {
            // iterate all clients
            uint256 n = _clients[agentId].length();
            for (uint256 i = 0; i < n; i++) {
                address c = _clients[agentId].at(i);
                (uint64 cCount, uint256 cSum) = _sumForClient(agentId, c, tag1, tag2);
                count += cCount;
                sum += cSum;
            }
        } else {
            for (uint256 i = 0; i < clientAddresses.length; i++) {
                (uint64 cCount, uint256 cSum) = _sumForClient(agentId, clientAddresses[i], tag1, tag2);
                count += cCount;
                sum += cSum;
            }
        }
        averageScore = count == 0 ? 0 : uint8(sum / count);
    }

    /// @inheritdoc IReputationRegistry
    function readFeedback(
        uint256 agentId,
        address clientAddress,
        uint64 index
    ) external view override returns (uint8 score, bytes32 tag1, bytes32 tag2, bool isRevoked) {
        require(_exists(agentId), "agent !exists");
        require(index < _feedback[agentId][clientAddress].length, "index OOB");
        Feedback storage fb = _feedback[agentId][clientAddress][index];
        return (fb.score, fb.tag1, fb.tag2, fb.revoked);
    }

    /// @inheritdoc IReputationRegistry
    function readAllFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        bytes32 tag1,
        bytes32 tag2,
        bool includeRevoked
    ) external view override returns (
        address[] memory outClients,
        uint8[]    memory scores,
        bytes32[]  memory tag1s,
        bytes32[]  memory tag2s,
        bool[]     memory revokedStatuses
    ) {
        require(_exists(agentId), "agent !exists");

        // First pass: count
        uint256 total = 0;
        if (clientAddresses.length == 0) {
            uint256 n = _clients[agentId].length();
            for (uint256 i = 0; i < n; i++) {
                total += _countForClient(agentId, _clients[agentId].at(i), tag1, tag2, includeRevoked);
            }
        } else {
            for (uint256 i = 0; i < clientAddresses.length; i++) {
                total += _countForClient(agentId, clientAddresses[i], tag1, tag2, includeRevoked);
            }
        }

        outClients = new address[](total);
        scores     = new uint8[](total);
        tag1s      = new bytes32[](total);
        tag2s      = new bytes32[](total);
        revokedStatuses = new bool[](total);

        // Second pass: fill
        uint256 k = 0;
        if (clientAddresses.length == 0) {
            uint256 n = _clients[agentId].length();
            for (uint256 i = 0; i < n; i++) {
                k = _fillForClient(agentId, _clients[agentId].at(i), tag1, tag2, includeRevoked, outClients, scores, tag1s, tag2s, revokedStatuses, k);
            }
        } else {
            for (uint256 i = 0; i < clientAddresses.length; i++) {
                k = _fillForClient(agentId, clientAddresses[i], tag1, tag2, includeRevoked, outClients, scores, tag1s, tag2s, revokedStatuses, k);
            }
        }
    }

    /// @inheritdoc IReputationRegistry
    function getResponseCount(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        address[] calldata responders
    ) external view override returns (uint64) {
        require(_exists(agentId), "agent !exists");
        require(feedbackIndex < _feedback[agentId][clientAddress].length, "index OOB");
        if (responders.length == 0) {
            // Sum all known responders isn’t tracked; return 0 if not specified.
            // (Design: callers pass responders they care about.)
            return 0;
        }
        uint64 total = 0;
        for (uint256 i = 0; i < responders.length; i++) {
            total += _responseCount[agentId][clientAddress][feedbackIndex][responders[i]];
        }
        return total;
    }

    /// @inheritdoc IReputationRegistry
    function getClients(uint256 agentId) external view override returns (address[] memory) {
        require(_exists(agentId), "agent !exists");
        uint256 n = _clients[agentId].length();
        address[] memory arr = new address[](n);
        for (uint256 i = 0; i < n; i++) arr[i] = _clients[agentId].at(i);
        return arr;
    }

    /// @inheritdoc IReputationRegistry
    function getLastIndex(uint256 agentId, address clientAddress) external view override returns (uint64) {
        require(_exists(agentId), "agent !exists");
        uint256 len = _feedback[agentId][clientAddress].length;
        return len == 0 ? type(uint64).max : uint64(len - 1);
    }

    /// @inheritdoc IReputationRegistry
    function getIdentityRegistry() external view override returns (address) {
        return address(_idRegistry);
    }

    // ---------- Internal helpers ----------

    function _exists(uint256 agentId) internal view returns (bool) {
        // IERC721.ownerOf MUST revert if !exists, so we check with try/catch
        try _idRegistry.ownerOf(agentId) returns (address o) {
            return o != address(0);
        } catch {
            return false;
        }
    }

    function _requireOwnerOrOperator(uint256 agentId, address signer) internal view {
        address owner = _idRegistry.ownerOf(agentId);
        if (signer == owner) return;
        if (_idRegistry.getApproved(agentId) == signer) return;
        if (_idRegistry.isApprovedForAll(owner, signer)) return;
        revert("signer !owner/operator");
    }

    function _feedbackAuthHash(
        uint256 agentId,
        address clientAddress,
        uint64 indexLimit,
        uint64 expiry,
        uint64 chainId,
        address identityRegistry,
        address signer
    ) internal view returns (bytes32) {
        // Domain-separated EIP-191 hash: keccak256(
        //   "\x19Ethereum Signed Message:\n32" || keccak256(FEEDBACK_DOMAIN, chainId, address(this), idRegistry, agentId, client, indexLimit, expiry, signer)
        // )
        bytes32 inner = keccak256(
            abi.encode(
                FEEDBACK_DOMAIN,
                chainId,
                address(this),
                identityRegistry,
                agentId,
                clientAddress,
                indexLimit,
                expiry,
                signer
            )
        );
        return inner.toEthSignedMessageHash();
    }

    function _verifySignatureFlexible(address signer, bytes32 msgHash, bytes memory signature) internal view {
        if (signer.code.length == 0) {
            // EOA path
            address recovered = ECDSA.recover(msgHash, signature);
            require(recovered == signer, "bad EOA sig");
        } else {
            // ERC-1271 path
            bytes4 magic = IERC1271(signer).isValidSignature(msgHash, signature);
            require(magic == IERC1271.isValidSignature.selector, "bad 1271 sig");
        }
    }

    function _sumForClient(
        uint256 agentId,
        address client,
        bytes32 tag1,
        bytes32 tag2
    ) internal view returns (uint64 count, uint256 sum) {
        Feedback[] storage arr = _feedback[agentId][client];
        for (uint256 j = 0; j < arr.length; j++) {
            Feedback storage fb = arr[j];
            if (fb.revoked) continue;
            if (tag1 != bytes32(0) && fb.tag1 != tag1) continue;
            if (tag2 != bytes32(0) && fb.tag2 != tag2) continue;
            sum += fb.score;
            count += 1;
        }
    }

    function _countForClient(
        uint256 agentId,
        address client,
        bytes32 tag1,
        bytes32 tag2,
        bool includeRevoked
    ) internal view returns (uint256 n) {
        Feedback[] storage arr = _feedback[agentId][client];
        for (uint256 j = 0; j < arr.length; j++) {
            Feedback storage fb = arr[j];
            if (!includeRevoked && fb.revoked) continue;
            if (tag1 != bytes32(0) && fb.tag1 != tag1) continue;
            if (tag2 != bytes32(0) && fb.tag2 != tag2) continue;
            n++;
        }
    }

    function _fillForClient(
        uint256 agentId,
        address client,
        bytes32 tag1,
        bytes32 tag2,
        bool includeRevoked,
        address[] memory outClients,
        uint8[] memory scores,
        bytes32[] memory tag1s,
        bytes32[] memory tag2s,
        bool[] memory revokedStatuses,
        uint256 k
    ) internal view returns (uint256) {
        Feedback[] storage arr = _feedback[agentId][client];
        for (uint256 j = 0; j < arr.length; j++) {
            Feedback storage fb = arr[j];
            if (!includeRevoked && fb.revoked) continue;
            if (tag1 != bytes32(0) && fb.tag1 != tag1) continue;
            if (tag2 != bytes32(0) && fb.tag2 != tag2) continue;
            outClients[k] = client;
            scores[k] = fb.score;
            tag1s[k] = fb.tag1;
            tag2s[k] = fb.tag2;
            revokedStatuses[k] = fb.revoked;
            k++;
        }
        return k;
    }

    // ---------- Auth encoding/decoding ----------

    function _decodeAuth(bytes calldata blob)
        internal
        pure
        returns (
            uint256 agentId,
            address clientAddress,
            uint64 indexLimit,
            uint64 expiry,
            uint64 chainId,
            address identityRegistry,
            address signer,
            bytes memory signature
        )
    {
        // Tight ABI decoding as documented in giveFeedback()
        (agentId, clientAddress, indexLimit, expiry, chainId, identityRegistry, signer, signature) =
            abi.decode(blob, (uint256, address, uint64, uint64, uint64, address, address, bytes));
    }
}
