import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { mdns } from "@libp2p/mdns";
import { mplex } from "@libp2p/mplex";
import { tcp } from "@libp2p/tcp";
import { createLibp2p, Libp2p } from "libp2p";
import { identify } from "@libp2p/identify";
import { pipe } from "it-pipe";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";
import map from "it-map";

import {
  GhanimaBlockchain,
  Account,
  Block,
  Transaction,
  Blockchain,
} from "./index";

import {
  GossipSub,
  gossipsub,
  GossipsubEvents,
} from "@chainsafe/libp2p-gossipsub";
import { IBlock, ITransaction } from "./types";
import { multiaddr } from "multiaddr";

export const createNode = async () => {
  const node = await createLibp2p({
    addresses: {
      listen: ["/ip4/0.0.0.0/tcp/0"],
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
  let node: Libp2p<{
    pubsub: GossipSub;
  }> | null = null;
  node = (await createNode()) as any;
  let identified = false;

  if (node) {
    node.services.pubsub.subscribe("NEW_CHAIN");
    node.services.pubsub.subscribe("NEW_TRANSACTION");
    node.services.pubsub.subscribe("NEW_NODE");

    node.addEventListener("peer:connect", async () => {
      if (!identified) {
        identified = true;
        console.log(node.getConnections()[0].remoteAddr);

        const stream = await node.dialProtocol(
          node.getConnections()[0].remoteAddr,
          "/hi/1.0.0"
        );

        await pipe([uint8ArrayFromString("TESTANDO ESSA MERDA")], stream.sink);
      } else {
        node.removeEventListener("peer:connect");
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
        case "NEW_NODE":
          handleNewNode(content);
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
      console.log("hi", blockchain.getAddresses());
    }
  }

  function createNewTransaction() {}
}

bootstrapClientNode();
