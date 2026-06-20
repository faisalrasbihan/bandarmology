/**
 * The entity → known-wallet-address bridge. This mapping (which public addresses
 * belong to which client) is the only link between an AMINA client and the public
 * ledger; it's what lets the investigation view show a client's on-chain activity
 * alongside its internal transactions. Public/operational reference data, keyed
 * by lower-cased entity name. Synthetic addresses for the demo.
 */
export interface KnownAddress {
  chain: string;
  address: string;
}

export const KNOWN_ADDRESSES: Record<string, KnownAddress[]> = {
  binance: [{ chain: "ethereum", address: "0xB1a9ce0nce5pot00000000000000000000000001" }],
  wirecard: [{ chain: "ethereum", address: "0xW1rec4rd0000000000000000000000000000aa02" }],
  "lindenhof holdings ag": [{ chain: "ethereum", address: "0xL1nden0f0000000000000000000000000000bb03" }],
};

export function addressesFor(entityName: string): KnownAddress[] {
  return KNOWN_ADDRESSES[entityName.toLowerCase()] ?? [];
}

/** Entity names that have a known on-chain footprint (get a synthetic feed). */
export const ONCHAIN_SEED_ENTITIES = ["Binance", "Wirecard", "Lindenhof Holdings AG"];
