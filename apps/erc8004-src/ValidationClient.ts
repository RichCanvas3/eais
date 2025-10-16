/**
 * Validation Client for ERC-8004
 * Handles validation requests and responses
 */

import { BlockchainAdapter } from './adapters/types';
import { ValidationStatus } from './types';
import ValidationRegistryABI from './abis/ValidationRegistry.json';
import { ethers } from 'ethers';

export interface ValidationRequestParams {
  validatorAddress: string; // MANDATORY
  agentId: bigint; // MANDATORY
  requestUri: string; // MANDATORY
  requestHash: string; // MANDATORY (bytes32 hash of content at requestUri)
}

export interface ValidationResponseParams {
  requestHash: string; // MANDATORY (bytes32)
  response: number; // MANDATORY (0-100)
  responseUri?: string; // OPTIONAL
  responseHash?: string; // OPTIONAL (bytes32)
  tag?: string; // OPTIONAL (bytes32)
}

export class ValidationClient {
  private adapter: BlockchainAdapter;
  private contractAddress: string;

  constructor(adapter: BlockchainAdapter, contractAddress: string) {
    this.adapter = adapter;
    this.contractAddress = contractAddress;
  }

  /**
   * Request validation from a validator
   * Spec: function validationRequest(address validatorAddress, uint256 agentId, string requestUri, bytes32 requestHash)
   * Note: MUST be called by owner or operator of agentId
   * Note: requestHash MUST be keccak256 of the content at requestUri
   *
   * @param params - Validation request parameters
   * @returns Transaction result with requestHash
   */
  async validationRequest(params: ValidationRequestParams): Promise<{ txHash: string; requestHash: string }> {
    const result = await this.adapter.send(
      this.contractAddress,
      ValidationRegistryABI,
      'validationRequest',
      [params.validatorAddress, params.agentId, params.requestUri, params.requestHash]
    );

    return {
      txHash: result.txHash,
      requestHash: params.requestHash,
    };
  }

  /**
   * Provide a validation response
   * Spec: function validationResponse(bytes32 requestHash, uint8 response, string responseUri, bytes32 responseHash, bytes32 tag)
   * Note: MUST be called by the validatorAddress specified in the original request
   * Note: Can be called multiple times for the same requestHash
   *
   * @param params - Validation response parameters
   * @returns Transaction result
   */
  async validationResponse(params: ValidationResponseParams): Promise<{ txHash: string }> {
    // Validate response is 0-100
    if (params.response < 0 || params.response > 100) {
      throw new Error('Response MUST be between 0 and 100');
    }

    // Convert optional parameters to proper format
    const responseUri = params.responseUri || '';
    const responseHash = params.responseHash || ethers.ZeroHash;
    const tag = params.tag ? ethers.id(params.tag).slice(0, 66) : ethers.ZeroHash;

    const result = await this.adapter.send(
      this.contractAddress,
      ValidationRegistryABI,
      'validationResponse',
      [params.requestHash, params.response, responseUri, responseHash, tag]
    );

    return { txHash: result.txHash };
  }

  /**
   * Get the identity registry address
   * Spec: function getIdentityRegistry() external view returns (address identityRegistry)
   */
  async getIdentityRegistry(): Promise<string> {
    return await this.adapter.call(
      this.contractAddress,
      ValidationRegistryABI,
      'getIdentityRegistry',
      []
    );
  }

  /**
   * Get validation status for a request
   * Spec (new): function getValidationStatus(bytes32 requestHash) returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, bytes32 tag, uint256 lastUpdate)
   * Spec (old): function getValidationStatus(bytes32 requestHash) returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 tag, uint256 lastUpdate)
   * Note: Backward compatible with both old and new contract versions
   *
   * @param requestHash - The request hash (bytes32)
   * @returns Validation status
   */
  async getValidationStatus(requestHash: string): Promise<ValidationStatus> {
    try {
      // Try with new ABI first (6 return values)
      const result = await this.adapter.call(
        this.contractAddress,
        ValidationRegistryABI,
        'getValidationStatus',
        [requestHash]
      );

      return {
        validatorAddress: result.validatorAddress || result[0],
        agentId: BigInt(result.agentId || result[1]),
        response: Number(result.response || result[2]),
        responseHash: result.responseHash || result[3],
        tag: result.tag || result[4],
        lastUpdate: BigInt(result.lastUpdate || result[5]),
      };
    } catch (error: any) {
      // If decoding fails, try with old ABI (5 return values, no responseHash)
      if (error.code === 'BAD_DATA' || error.message?.includes('could not decode result data')) {
        // Create old ABI for getValidationStatus without responseHash
        const oldABI = [
          {
            inputs: [{ internalType: 'bytes32', name: 'requestHash', type: 'bytes32' }],
            name: 'getValidationStatus',
            outputs: [
              { internalType: 'address', name: 'validatorAddress', type: 'address' },
              { internalType: 'uint256', name: 'agentId', type: 'uint256' },
              { internalType: 'uint8', name: 'response', type: 'uint8' },
              { internalType: 'bytes32', name: 'tag', type: 'bytes32' },
              { internalType: 'uint256', name: 'lastUpdate', type: 'uint256' }
            ],
            stateMutability: 'view',
            type: 'function'
          }
        ];

        const result = await this.adapter.call(
          this.contractAddress,
          oldABI,
          'getValidationStatus',
          [requestHash]
        );

        return {
          validatorAddress: result.validatorAddress || result[0],
          agentId: BigInt(result.agentId || result[1]),
          response: Number(result.response || result[2]),
          responseHash: ethers.ZeroHash, // Default for old contracts
          tag: result.tag || result[3],
          lastUpdate: BigInt(result.lastUpdate || result[4]),
        };
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Get validation summary for an agent
   * Spec: function getSummary(uint256 agentId, address[] validatorAddresses, bytes32 tag) returns (uint64 count, uint8 avgResponse)
   * Note: agentId is ONLY mandatory parameter, validatorAddresses and tag are OPTIONAL filters
   *
   * @param agentId - The agent ID (MANDATORY)
   * @param validatorAddresses - OPTIONAL filter by specific validators
   * @param tag - OPTIONAL filter by tag
   * @returns Summary statistics
   */
  async getSummary(
    agentId: bigint,
    validatorAddresses?: string[],
    tag?: string
  ): Promise<{ count: bigint; avgResponse: number }> {
    const validators = validatorAddresses || [];
    const tagBytes = tag ? ethers.id(tag).slice(0, 66) : ethers.ZeroHash;

    const result = await this.adapter.call(
      this.contractAddress,
      ValidationRegistryABI,
      'getSummary',
      [agentId, validators, tagBytes]
    );

    return {
      count: BigInt(result.count || result[0]),
      avgResponse: Number(result.avgResponse || result[1]),
    };
  }

  /**
   * Get all validation request hashes for an agent
   * Spec: function getAgentValidations(uint256 agentId) returns (bytes32[] requestHashes)
   *
   * @param agentId - The agent ID
   * @returns Array of request hashes
   */
  async getAgentValidations(agentId: bigint): Promise<string[]> {
    return await this.adapter.call(
      this.contractAddress,
      ValidationRegistryABI,
      'getAgentValidations',
      [agentId]
    );
  }

  /**
   * Get all request hashes for a validator
   * Spec: function getValidatorRequests(address validatorAddress) returns (bytes32[] requestHashes)
   *
   * @param validatorAddress - The validator address
   * @returns Array of request hashes
   */
  async getValidatorRequests(validatorAddress: string): Promise<string[]> {
    return await this.adapter.call(
      this.contractAddress,
      ValidationRegistryABI,
      'getValidatorRequests',
      [validatorAddress]
    );
  }
}