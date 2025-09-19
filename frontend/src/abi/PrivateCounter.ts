export const PRIVATE_COUNTER_ABI = [
  {
    "inputs":[
      {"internalType":"externalEuint32","name":"encryptedDelta","type":"externalEuint32"},
      {"internalType":"bytes","name":"inputProof","type":"bytes"}
    ],
    "name":"add","outputs":[],"stateMutability":"nonpayable","type":"function"
  },
  { "inputs":[], "name":"requestReveal", "outputs":[], "stateMutability":"nonpayable", "type":"function" },
  {
    "inputs":[], "name":"totalPlain",
    "outputs":[{"internalType":"uint32","name":"","type":"uint32"}],
    "stateMutability":"view","type":"function"
  }
] as const;
