export interface IAccount {
  publicKey: string;
  privateKey: string;
}

export interface ITransaction {
  from: string;
  to: string;
  amount: number;
  signature: string;
}

export interface IBlock {
  data: ITransaction[];
  previous: string;
  author: string;
  nonce: number;
  timestamp: number;
  difficulty: number;
  hash: string;
}

export interface IBlockchain {
  blocks: IBlock[];
  addresses: string[];
  transactionsPool: ITransaction[];
  currentDifficulty: number;
  minerReward: number;
  minterAddress: string;
}

export interface IGhanimaBlockchain extends IBlockchain {}
