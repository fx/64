// C64 Ultimate device REST API response types
// Reference: docs/c64.md
//
// C64UInfoResponse and C64UVersionResponse are canonical aliases for
// C64DeviceInfo and C64VersionResponse in types.ts — single source of truth.

import type { C64DeviceInfo, C64VersionResponse } from "./types.ts";

/** Base response — every C64U JSON response includes an errors array */
export interface C64UBaseResponse {
  errors: string[];
}

// ── About ──────────────────────────────────────────────

export type C64UVersionResponse = C64VersionResponse;
export type C64UInfoResponse = C64DeviceInfo;

// ── Configuration ──────────────────────────────────────

export interface C64UConfigCategoriesResponse extends C64UBaseResponse {
  categories: string[];
}

/** GET /v1/configs/<category> — values keyed by category then item name */
export interface C64UConfigValuesResponse extends C64UBaseResponse {
  [category: string]: Record<string, string | number> | string[];
}

export interface C64UConfigItemDetail {
  current: string | number;
  min?: number;
  max?: number;
  format?: string;
  default?: string | number;
}

/** GET /v1/configs/<category>/<item> — detailed item info */
export interface C64UConfigDetailResponse extends C64UBaseResponse {
  [category: string]: Record<string, C64UConfigItemDetail> | string[];
}

// ── Floppy Drives ──────────────────────────────────────

export interface C64UDriveInfo {
  enabled: boolean;
  bus_id: number;
  type: string;
  rom?: string;
  image_file?: string;
  image_path?: string;
  last_error?: string;
  partitions?: Array<{ id: number; path: string }>;
}

export interface C64UDrivesResponse extends C64UBaseResponse {
  drives: Array<Record<string, C64UDriveInfo>>;
}

// ── Machine ────────────────────────────────────────────

export interface C64UDebugRegResponse extends C64UBaseResponse {
  value: string;
}

/** Generic action response (reset, reboot, pause, resume, etc.) */
export interface C64UActionResponse extends C64UBaseResponse {}

// ── Runners ────────────────────────────────────────────

/** Runner responses are action responses — just errors array */
export interface C64URunnerResponse extends C64UBaseResponse {}

// ── Data Streams ───────────────────────────────────────

export interface C64UStreamResponse extends C64UBaseResponse {}

// ── File Manipulation ──────────────────────────────────

export interface C64UFileInfoResponse extends C64UBaseResponse {
  [key: string]: unknown;
}

export interface C64UFileCreateResponse extends C64UBaseResponse {}

// ── Proxy Error Envelope ───────────────────────────────

export interface ProxyErrorResponse {
  errors: string[];
  proxy_error: true;
}
