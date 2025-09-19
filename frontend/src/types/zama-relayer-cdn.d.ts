declare module "https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.js" {
  export function initSDK(): Promise<void>;
  export function createInstance(cfg: any): Promise<any>;
  export const SepoliaConfig: any;
}
