import { hc } from "hono/client";
import type { AppType } from "../../server/index.ts";

export const api = hc<AppType>("/").api;

// Hono RPC type inference examples for proxy routes:
//
//   const info = await api.devices[':deviceId'].v1.info.$get({ param: { deviceId: '8D927F' } });
//   // info response is typed as C64UInfoResponse
//
//   const drives = await api.devices[':deviceId'].v1.drives.$get({ param: { deviceId: '8D927F' } });
//   // drives response is typed as C64UDrivesResponse
//
//   const mem = await api.devices[':deviceId'].v1['machine:readmem'].$get({
//     param: { deviceId: '8D927F' },
//     query: { address: '0400', length: '1000' },
//   });
//   // mem response is binary (application/octet-stream)
