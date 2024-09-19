import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { mdns } from "@libp2p/mdns";
import { mplex } from "@libp2p/mplex";
import { tcp } from "@libp2p/tcp";
import { createLibp2p, Libp2p } from "libp2p";
import { identify } from "@libp2p/identify";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";
import {
  GhanimaBlockchain,
  Account,
  Block,
  Transaction,
  Blockchain,
} from "./index";

import { GossipSub, gossipsub } from "@chainsafe/libp2p-gossipsub";
import { IBlock, ITransaction } from "./types";
import map from "it-map";
import { pipe } from "it-pipe";
import { GENESIS_BLOCK } from "./genesisBlock";

const ASK_CHAIN_PROTOCOL = "ask_chain";

const ALL_LOCAL_IPS = "/ip4/0.0.0.0/tcp/0";

export const createNode = async () => {
  const node = await createLibp2p({
    addresses: {
      listen: [ALL_LOCAL_IPS],
    },
    transports: [tcp()],
    streamMuxers: [yamux(), mplex()],
    connectionEncryption: [noise()],
    peerDiscovery: [
      mdns({
        interval: 20e3,
      }),
    ],
    services: {
      pubsub: gossipsub(),
      identify: identify(),
    },
  });

  return node;
};

export async function bootstrapClientNode() {
  const blockchain = new GhanimaBlockchain();
  blockchain.blocks = [];
  let node: Libp2p<{
    pubsub: GossipSub;
  }> | null = null;
  node = (await createNode()) as any;
  let identified = false;

  if (node) {
    node.services.pubsub.subscribe("NEW_CHAIN");
    node.services.pubsub.subscribe("NEW_TRANSACTION");
    node.services.pubsub.subscribe("NEW_NODE");

    await node.handle(ASK_CHAIN_PROTOCOL, async ({ stream }) => {
      // Receive JSON data from the remote peer
      pipe(
        // Read from the stream (the source)
        stream.source,
        // Sink function
        async function () {
          await pipe(
            [uint8ArrayFromString(JSON.stringify(blockchain.blocks))],
            stream.sink
          );
        }
      );
    });

    node.addEventListener("peer:discovery", async (e) => {
      if (!identified) {
        identified = true;

        const firstConnection = e.detail.id;

        if (firstConnection) {
          const stream = await node.dialProtocol(
            firstConnection,
            ASK_CHAIN_PROTOCOL
          );

          pipe(
            stream,
            (source) =>
              map(source, (buf) => uint8ArrayToString(buf.subarray())),
            async function (source) {
              // For each chunk of data
              let totalMessage = "";
              for await (const msg of source) {
                totalMessage += msg;
              }

              console.log(JSON.parse(totalMessage));
              console.log("==== CHEGOU AQUI NO NODE NOVO! =====");

              const chain = JSON.parse(totalMessage);

              handleNewChain(chain as unknown as Block[]);

              stream.close();
            }
          );
        }
      } else {
      }
    });

    node.services.pubsub.addEventListener("message", (message) => {
      console.log(
        "aaa",
        message.detail.topic,
        JSON.stringify(new TextDecoder().decode(message.detail.data))
      );
      const content = JSON.stringify(
        new TextDecoder().decode(message.detail.data)
      );
      switch (message.detail.topic) {
        case "NEW_CHAIN":
          handleNewChain(JSON.parse(content));
          break;
        case "NEW_TRANSACTION":
          handleNewTransaction(JSON.parse(content));
          break;
      }
    });
  }

  function handleNewChain(chain: IBlock[]) {
    if (
      Blockchain.isChainValid(chain) &&
      chain.length > blockchain.getChainSize()
    ) {
      blockchain.blocks = chain.map((block) => new Block(block));
      blockchain.transactionsPool = [];
    }
  }

  function handleNewTransaction(transaction: ITransaction) {}

  function handleNewNode(address: string) {
    if (address) {
      blockchain.addresses.push(address);
    }
  }

  function createNewTransaction() {}
}

bootstrapClientNode();
