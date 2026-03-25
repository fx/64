# 0011 — Stream Viewer

## Overview

Receive and display the U64's real-time video and audio streams in the browser. The U64 can stream its video output and audio over UDP. The proxy bridges these UDP streams into a browser-compatible format (WebRTC or HTTP-based).

## Background

The U64 (not UII+) can send real-time data streams to a target IP via UDP:
- **Video stream:** UDP port 11000 (default)
- **Audio stream:** UDP port 11001 (default)
- **Debug stream:** UDP port 11002 (default)

Started via `PUT /v1/streams/<stream>:start?ip=<target-ip>` and stopped via `PUT /v1/streams/<stream>:stop`.

Note: Starting the video stream automatically stops the debug stream (they share hardware resources).

## Goals

- Start/stop video and audio streams from the UI
- Display video stream in the browser in near-real-time
- Play audio stream in the browser
- Low latency (< 500ms target for video)
- Stream controls (start/stop, quality indicators)

## Non-Goals

- Recording streams to files (future)
- Stream forwarding to external services (Twitch, etc.)
- Debug stream visualization (highly specialized, future)
- UII+ support (streams are U64-only hardware feature)

## Technical Design

### Challenge: UDP to Browser

Browsers cannot receive UDP directly. The proxy server must:
1. Tell the U64 to stream to the proxy's IP
2. Receive UDP packets on the proxy server
3. Re-encode and forward to the browser

### Architecture Options

**Option A: WebRTC (Recommended)**
- Proxy receives UDP video/audio
- Decodes the U64's raw format into a standard codec
- Serves as a WebRTC peer, sending video/audio tracks to the browser
- Lowest latency option
- Requires understanding the U64's stream format (undocumented publicly)

**Option B: HTTP Chunked / MSE**
- Proxy receives UDP, muxes into fragmented MP4 or WebM
- Serves via HTTP chunked transfer or Media Source Extensions
- Higher latency but simpler implementation
- Well-supported in all browsers

**Option C: WebSocket Binary**
- Proxy receives UDP, forwards raw frames over WebSocket
- Client-side JavaScript decodes and renders to canvas
- Maximum flexibility but requires custom decoder
- Feasible for low-resolution C64 output (320x200 or 384x272)

### Stream Format Research Required

The U64's stream format is not publicly documented in the REST API docs. Implementation requires:
1. Capturing sample stream data by pointing the U64 at a UDP listener
2. Analyzing the packet format (header, payload, encoding)
3. Determining if it's raw pixels, compressed, or a standard format

This spec should be treated as a **spike/research phase** followed by implementation.

### API Endpoints

```
POST   /api/devices/:deviceId/streams/video/start   → start video stream (U64 sends to proxy)
POST   /api/devices/:deviceId/streams/video/stop     → stop video stream
POST   /api/devices/:deviceId/streams/audio/start    → start audio stream
POST   /api/devices/:deviceId/streams/audio/stop     → stop audio stream
GET    /api/devices/:deviceId/streams/status          → get active streams
```

The actual video/audio delivery to the browser depends on the chosen architecture option (WebRTC signaling endpoint, or HTTP chunked stream URL).

### UI

- **Stream panel:** Video display area (canvas or video element), audio toggle
- **Controls:** Start/stop buttons, latency indicator, stream quality stats
- **Picture-in-picture:** Option to pop out video into a floating window

## Open Questions

1. What is the U64's video stream format? (Requires hardware testing)
2. What is the audio stream format? (PCM? Compressed?)
3. What packet rate and bandwidth does the video stream produce?
4. Is the video interlaced or progressive?
5. Should we use a media server library (e.g., mediasoup, Pion) or build minimal?

## Acceptance Criteria

- [ ] Start/stop video stream via API (U64 streams to proxy)
- [ ] Proxy receives UDP video packets
- [ ] Video displays in browser with < 500ms latency
- [ ] Audio plays in browser synchronized with video
- [ ] Stream status is reported via SSE
- [ ] UI shows stream controls and quality indicators

## Tasks

- [ ] Research spike: capture and analyze U64 stream format
  - [ ] Set up UDP listener on proxy server to capture raw stream packets
  - [ ] Start video stream via `PUT /v1/streams/video:start?ip=<proxy-ip>` and capture packets
  - [ ] Start audio stream via `PUT /v1/streams/audio:start?ip=<proxy-ip>` and capture packets
  - [ ] Analyze packet headers, payload format, frame boundaries, encoding
  - [ ] Document findings: resolution, framerate, pixel format, audio sample rate/format
  - [ ] Decide on browser delivery method (WebRTC vs MSE vs WebSocket+canvas) based on findings
- [ ] Implement stream control API endpoints
  - [ ] `POST /api/devices/:deviceId/streams/video/start` — tell U64 to stream video to proxy's IP
  - [ ] `POST /api/devices/:deviceId/streams/video/stop` — stop video stream
  - [ ] `POST /api/devices/:deviceId/streams/audio/start` — start audio stream to proxy
  - [ ] `POST /api/devices/:deviceId/streams/audio/stop` — stop audio stream
  - [ ] `GET /api/devices/:deviceId/streams/status` — return which streams are active
  - [ ] Emit SSE events on stream start/stop
- [ ] Implement UDP receiver and browser bridge
  - [ ] Create UDP socket listener on proxy for video (port 11000) and audio (port 11001)
  - [ ] Decode incoming packets based on research findings
  - [ ] Implement chosen delivery method to browser (WebRTC signaling, or HTTP chunked stream, or WebSocket binary relay)
  - [ ] Handle stream lifecycle: start receiver when stream starts, clean up on stop
- [ ] Build stream viewer UI
  - [ ] Video display area (canvas or `<video>` element depending on delivery method)
  - [ ] Audio toggle (mute/unmute)
  - [ ] Start/stop buttons for video and audio streams
  - [ ] Latency indicator and stream quality stats (packet rate, dropped frames)
  - [ ] Picture-in-picture support (pop out video to floating window)
