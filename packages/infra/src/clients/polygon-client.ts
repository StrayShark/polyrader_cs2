const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL ?? 'https://polygon-rpc.com';

interface RpcResponse {
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface TransactionReceipt {
  transactionHash: string;
  blockNumber: string;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
}

export interface LogEntry {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
}

export class PolygonClient {
  private rpcUrl: string;

  constructor(rpcUrl?: string) {
    this.rpcUrl = rpcUrl ?? POLYGON_RPC_URL;
  }

  async rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`Polygon RPC error: ${response.status}`);
    }

    const data = await response.json() as RpcResponse;
    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }

    return data.result;
  }

  async getBalance(address: string): Promise<string> {
    return this.rpcCall('eth_getBalance', [address, 'latest']) as Promise<string>;
  }

  async getTransactionReceipt(txHash: string): Promise<TransactionReceipt> {
    return this.rpcCall('eth_getTransactionReceipt', [txHash]) as Promise<TransactionReceipt>;
  }

  async getBlockNumber(): Promise<number> {
    const result = await this.rpcCall('eth_blockNumber', []);
    return parseInt(result as string, 16);
  }

  async getLogs(params: {
    address?: string;
    topics?: string[];
    fromBlock?: string;
    toBlock?: string;
  }): Promise<LogEntry[]> {
    return this.rpcCall('eth_getLogs', [params]) as Promise<LogEntry[]>;
  }
}
