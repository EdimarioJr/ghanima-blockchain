import {
  IAccount,
  IBlock,
  IBlockchain,
  IGhanimaBlockchain,
  ITransaction,
} from "./types";

import crypto from "crypto";
import elliptic from "elliptic";
import { GENESIS_BLOCK } from "./genesisBlock";

const EC = elliptic.ec;

const signatureCrypto = new EC("secp256k1");

export class Account implements IAccount {
  keyPair: any;
  publicKey: string;
  privateKey: string;

  constructor() {
    this.keyPair = signatureCrypto.genKeyPair();
    this.publicKey = this.keyPair.getPublic().encode("hex");
    // this.privateKey = this.keyPair.getPrivate().encode("hex");
  }

  getPublicKey() {
    return this.keyPair.getPublic().encode("hex");
  }

  sign(data) {
    return this.keyPair
      .sign(crypto.createHash("sha256").update(data).digest("hex"), "base64")
      .toDER("hex");
  }
}

export const MINTER = new Account();

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
      (from !== to || from === MINTER.getPublicKey()) &&
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

  sign(account) {
    if (account.getPublicKey() === this.from) {
      this.signature = account.sign(this.from + this.to + this.amount);
    }
  }
}

export class Block implements IBlock {
  data: Transaction[];
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

  generateHash() {
    return crypto
      .createHash("sha256")
      .update(
        JSON.stringify(this.data) +
          this.previous +
          this.author +
          this.nonce +
          this.timestamp
      )
      .digest("hex");
  }

  mine() {
    while (
      !this.hash.startsWith(
        Array.from(Array(this.difficulty), (_) => "0").join("")
      )
    ) {
      this.nonce++;
      this.hash = this.generateHash();
    }
  }
}

export class Blockchain implements IBlockchain {
  blocks: IBlock[];
  addresses: string[];
  transactionsPool: Transaction[];
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

  createBlock({ minerAccount }: { minerAccount: Account }) {
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
    newBlock.mine();
    if (this.transactionsPool.length) {
      this.transactionsPool = [];
      this.blocks.push(newBlock);
    }
  }

  static isChainValid(blocks: IBlock[]): boolean {
    return blocks.every((block, index) => {
      // GENESIS BLOCK
      if (index === 0) return true;
      return block.previous === blocks[index - 1].hash;
    });
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

  createTransaction({
    transaction,
    account,
  }: {
    transaction: Transaction;
    account: Account;
  }) {
    if (Transaction.isValid(transaction)) {
      const isTransactionFromHasMoney =
        this.getAddressAmount(transaction.from) >= transaction.amount;
      const isParticipantsInBlockChain =
        this.isTransactionParticipantInBlockchain({ ...transaction });
      if (isTransactionFromHasMoney && isParticipantsInBlockChain) {
        transaction.sign(account);
        if (transaction.isValidWithSignature()) {
          this.transactionsPool.push(transaction);
        }
      }
    }
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

  createAccount(address: string) {
    this.addresses.push(address);
  }

  getAddresses() {
    return this.addresses;
  }
}

export class GhanimaBlockchain
  extends Blockchain
  implements IGhanimaBlockchain
{
  minter: Account;

  constructor() {
    super({
      initialDifficulty: 3,
      minerReward: 50,
      minterAddress: MINTER.getPublicKey(),
    });
    this.minter = MINTER;
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
