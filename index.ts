import {
  IAccount,
  IBlock,
  IBlockchain,
  IGhanimaBlockchain,
  ITransaction,
} from "./types";

import crypto, { BinaryLike } from "crypto";
import elliptic from "elliptic";
import { GENESIS_BLOCK } from "./genesisBlock";
import { MINTER_PUBLIC_ADDRESS } from "./config";

const EC = elliptic.ec;

const signatureCrypto = new EC("secp256k1");

export class Account implements IAccount {
  keyPair: elliptic.ec.KeyPair;
  publicKey: string;
  privateKey: string;

  constructor() {
    this.keyPair = signatureCrypto.genKeyPair();
    this.publicKey = this.keyPair.getPublic().encode("hex", true);
    this.privateKey = this.keyPair.getPrivate().toString();
  }

  getPublicKey() {
    return this.publicKey;
  }

  sign(data: BinaryLike) {
    return this.keyPair
      .sign(crypto.createHash("sha256").update(data).digest("hex"), "base64")
      .toDER("hex");
  }
}

export class Transaction implements ITransaction {
  from: string;
  to: string;
  amount: number;
  signature: string;

  constructor({ from, to, amount }) {
    this.from = from;
    this.to = to;
    this.amount = amount;
    this.signature = "";
  }

  static isValid({ from, to, amount }) {
    return (
      from &&
      to &&
      (from !== to || from === MINTER_PUBLIC_ADDRESS) &&
      amount > 0
    );
  }

  isValidWithSignature() {
    return (
      Transaction.isValid({
        from: this.from,
        to: this.to,
        amount: this.amount,
      }) && this.signature
    );
  }

  sign(account: Account) {
    const fromIsAuthor = account.getPublicKey() === this.from;
    if (fromIsAuthor) {
      this.signature = account.sign(
        this.from.concat(this.to, String(this.amount))
      );
    }
  }
}

export class Block implements IBlock {
  data: ITransaction[];
  previous: string;
  author: string;
  nonce: number;
  timestamp: number;
  difficulty: number;
  hash: string;

  constructor({ data, previous, author, difficulty }) {
    this.data = data;
    this.previous = previous;
    this.author = author;
    this.nonce = 0;
    this.timestamp = new Date().getUTCMilliseconds();
    this.difficulty = difficulty;
    this.hash = this.generateHash();
  }

  static isValid({
    data,
    timestamp,
    previous,
    author,
    difficulty,
    hash,
  }: IBlock) {
    return (
      data.length &&
      data.every((transaction) => Transaction.isValid(transaction)) &&
      timestamp <= new Date().getUTCMilliseconds() &&
      Block.hashIsSolved({ hash, difficulty }) &&
      previous &&
      author
    );
  }

  static hashIsSolved({
    hash,
    difficulty,
  }: Pick<IBlock, "hash" | "difficulty">): boolean {
    return hash.startsWith(Array.from(Array(difficulty), (_) => "0").join(""));
  }

  generateHash() {
    return crypto
      .createHash("sha256")
      .update(
        JSON.stringify(this.data).concat(
          this.previous,
          this.author,
          String(this.nonce),
          String(this.timestamp)
        )
      )
      .digest("hex");
  }

  async mine() {
    return new Promise((resolve) => {
      while (
        !Block.hashIsSolved({ hash: this.hash, difficulty: this.difficulty })
      ) {
        this.nonce++;
        this.hash = this.generateHash();
      }

      resolve(true);
    });
  }
}

export class Blockchain implements IBlockchain {
  blocks: IBlock[];
  addresses: string[];
  transactionsPool: ITransaction[];
  currentDifficulty: number;
  minerReward: number;
  minterAddress: string;

  constructor({
    minerReward,
    initialDifficulty,
    minterAddress,
  }: {
    minerReward: number;
    initialDifficulty: number;
    minterAddress: string;
  }) {
    this.blocks = [];
    this.addresses = [];
    this.transactionsPool = [];
    this.currentDifficulty = initialDifficulty;
    this.minerReward = minerReward;
    this.minterAddress = minterAddress;
  }

  static isChainValid(blocks: IBlock[]): boolean {
    return blocks.every((block, index) => {
      if (Block.isValid(block)) {
        if (index === 0)
          // GENESIS BLOCK
          return true;
        return block.previous === blocks[index - 1].hash;
      }
      return false;
    });
  }

  async createBlock({
    minerAccount,
  }: {
    minerAccount: Account;
  }): Promise<IBlock | null> {
    const previousHash = this.blocks[this.blocks.length - 1]?.hash ?? "";

    const minerTransaction = new Transaction({
      from: this.minterAddress,
      to: minerAccount.getPublicKey(),
      amount: this.minerReward,
    });
    minerTransaction.sign(minerAccount);
    const data = [...this.transactionsPool];
    const newBlock = new Block({
      data: [...data, minerTransaction],
      previous: previousHash,
      author: minerAccount.getPublicKey(),
      difficulty: this.currentDifficulty,
    });
    await newBlock.mine();

    // Check if somebody did already mined a new block with the current transactions
    if (this.transactionsPool.length) {
      this.transactionsPool = [];
      this.blocks.push(newBlock);
      return newBlock;
    }

    return null;
  }

  getChainBrokenIndex(): number {
    const index = this.blocks.findIndex((block, index) => {
      if (index === 0) return false;
      return block.previous !== this.blocks[index - 1].hash;
    });

    if (typeof index === "undefined") return -1;
    return index;
  }

  getChainSize(): number {
    return this.blocks.length;
  }

  getLastBlock(): IBlock {
    return this.blocks[this.blocks.length - 1];
  }

  getChain(): IBlock[] {
    return this.blocks;
  }

  getAddressAmount(address: string): number {
    if (address) {
      let amount = 0;
      this.blocks.forEach((block) => {
        block.data.forEach((transaction) => {
          if (transaction.to === address) {
            amount += transaction.amount;
            return;
          }
          if (transaction.from === address) {
            amount -= transaction.amount;
          }
        });
      });
      return amount;
    }
    return 0;
  }

  createTransaction({
    transaction,
    account,
  }: {
    transaction: Transaction;
    account: Account;
  }) {
    if (!Transaction.isValid(transaction)) return null;

    const isTransactionFromHasMoney =
      this.getAddressAmount(transaction.from) >= transaction.amount;
    const isParticipantsInBlockChain =
      this.isTransactionParticipantInBlockchain({ ...transaction });

    if (!(isTransactionFromHasMoney && isParticipantsInBlockChain)) return null;

    transaction.sign(account);

    if (!transaction.isValidWithSignature()) return null;

    this.transactionsPool.push(transaction);
    return transaction;
  }

  isTransactionParticipantInBlockchain({
    from,
    to,
  }: {
    from: string;
    to: string;
  }) {
    return this.addresses.includes(from) && this.addresses.includes(to);
  }

  addAddress(address: string) {
    this.addresses = [...new Set([...this.addresses, address])];
  }

  getAddresses() {
    return this.addresses;
  }

  setChain(chain: IBlock[]) {
    if (Blockchain.isChainValid(chain)) this.blocks = chain;
  }
}

export class GhanimaBlockchain
  extends Blockchain
  implements IGhanimaBlockchain
{
  constructor() {
    super({
      initialDifficulty: 3,
      minerReward: 50,
      minterAddress: MINTER_PUBLIC_ADDRESS,
    });

    this.blocks = [GENESIS_BLOCK];
  }
}

// export const ghanima = new GhanimaBlockchain({
//   initialDifficulty: 2,
//   minerReward: 10,
//   minterAddress: MINTER.getPublicKey(),
// });

// const edimario = new Account();
// const andreza = new Account();

// ghanima.createAccount(edimario.getPublicKey());
// ghanima.createAccount(andreza.getPublicKey());

// const transactionToEdimario = new Transaction({
//   from: MINTER.getPublicKey(),
//   to: edimario.getPublicKey(),
//   amount: 5,
// });
// ghanima.createTransaction({
//   transaction: transactionToEdimario,
//   account: MINTER,
// });
// ghanima.createBlock({ minerAccount: andreza });

// const transaction = new Transaction({
//   from: edimario.getPublicKey(),
//   to: andreza.getPublicKey(),
//   amount: 2,
// });
// ghanima.createTransaction({ transaction, account: edimario });
// ghanima.createBlock({ minerAccount: andreza });
// console.log("HI", JSON.stringify(ghanima.getChain()));
