// import libp2p from "libp2p";
// import { tcp } from "@libp2p/tcp";
// import { websockets } from "@libp2p/websockets";
// import { mplex } from "@libp2p/mplex";
// import { noise } from "@libp2p/noise";
// import { dht } from "@libp2p/dht";
// import { bootstrap } from "@libp2p/bootstrap";

// async function createBootstrapNode() {
//   const bootstrapNode = await libp2p.create({
//     modules: {
//       transport: [new tcp(), new WebSockets()],
//       streamMuxer: [new Mplex()],
//       connEncryption: [new Noise()],
//       peerDiscovery: [new Bootstrap()],
//       dht: new DHT(),
//     },
//     config: {
//       peerDiscovery: {
//         [Bootstrap.tag]: {
//           list: [], // Lista de nós bootstrap (vazia, pois este é o nó bootstrap)
//         },
//       },
//     },
//   });

//   await bootstrapNode.start();
//   console.log(
//     "Bootstrap node started with id:",
//     bootstrapNode.peerId.toB58String()
//   );

//   bootstrapNode.multiaddrs.forEach((addr) => {
//     console.log(`Bootstrap node listening on ${addr.toString()}`);
//   });

//   // PubSub topic for discovery
//   const topic = "network-discovery";
//   const { pubsub } = bootstrapNode;

//   await pubsub.subscribe(topic);
//   console.log(`Bootstrap node subscribed to ${topic}`);

//   pubsub.on("message", (msg) => {
//     console.log(`Received message from ${msg.from}: ${msg.data.toString()}`);
//   });

//   // Broadcast the bootstrap node's address periodically
//   setInterval(() => {
//     const message = `Bootstrap node ID: ${bootstrapNode.peerId.toB58String()}`;
//     pubsub.publish(topic, Buffer.from(message));
//     console.log("Broadcasted message:", message);
//   }, 10000);
// }

// createBootstrapNode().catch(console.error);
