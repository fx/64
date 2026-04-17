# 0007: U64 Stream Viewer

## Summary

Add video and audio stream viewing for Ultimate 64 devices, relaying the device's UDP output stream to the browser via WebSocket for real-time display on a canvas element.

**Spec:** [Developer Tools](../specs/developer-tools/)
**Status:** draft
**Depends On:** —

## Motivation

- The Ultimate 64 can output its video/audio via UDP stream
- Viewing the C64 screen remotely is valuable for development and demonstration
- Currently no way to see the device output without a physical monitor

## Requirements

### Stream Format Discovery

The system MUST first research and document the U64 stream format before implementation.

#### Scenario: Research Spike

- **GIVEN** a U64 device with streaming capability
- **WHEN** a developer captures UDP packets from ports 11000-11002
- **THEN** the stream format (resolution, framerate, pixel format, audio sample rate) is documented

### Video Stream

The system SHOULD relay video stream data to the browser for canvas rendering.

#### Scenario: Start Video Stream

- **GIVEN** a U64 device is online and supports streaming
- **WHEN** a user clicks START on the stream viewer
- **THEN** the server begins capturing UDP video packets and relaying via WebSocket
- **AND** the browser renders frames on a canvas element

### Audio Stream

The system MAY relay audio stream data to the browser via Web Audio API.

#### Scenario: Enable Audio

- **GIVEN** video stream is active
- **WHEN** a user toggles audio on
- **THEN** audio stream data is decoded and played through Web Audio API

## Design

### Approach

This is a multi-phase feature starting with a research spike:

**Phase 1: Research**
- Capture raw UDP packets from U64 ports 11000 (video), 11001 (audio), 11002 (debug)
- Analyze packet format, headers, pixel encoding
- Document findings

**Phase 2: Server Relay**
- UDP listener on server
- WebSocket endpoint to relay decoded frames to browser
- Start/stop control via REST API

**Phase 3: Browser Rendering**
- Canvas element for video (320x200 or 384x272 with borders)
- Web Audio API for audio playback
- Controls: start, stop, fullscreen, picture-in-picture

### Decisions

- **Decision**: WebSocket relay rather than WebRTC
  - **Why**: Simpler, no STUN/TURN needed for homelab LAN
  - **Alternatives considered**: WebRTC (overkill for single-viewer LAN), HTTP chunked (too much latency)

- **Decision**: Canvas rendering rather than video element
  - **Why**: Raw pixel data, not a standard video codec; canvas gives direct pixel control
  - **Alternatives considered**: Encoding to H.264 on server (too much CPU for a relay)

### Non-Goals

- Recording/playback of streams
- Multiple simultaneous viewers
- Non-U64 device support (only U64 has stream output)

## Tasks

- [ ] Research spike: capture and analyze U64 UDP stream format
  - [ ] Set up packet capture on ports 11000-11002
  - [ ] Document packet structure, headers, pixel format
  - [ ] Determine resolution, framerate, color space
  - [ ] Document audio format (sample rate, encoding, channels)
- [ ] Implement server-side UDP receiver and WebSocket relay
  - [ ] UDP listener for video/audio ports
  - [ ] WebSocket endpoint: /api/devices/:deviceId/streams/ws
  - [ ] REST control: POST /api/devices/:deviceId/streams/video/start|stop
  - [ ] REST status: GET /api/devices/:deviceId/streams/status
- [ ] Implement browser rendering
  - [ ] Canvas component for video frames
  - [ ] Web Audio API integration for audio
  - [ ] Stream viewer panel on device dashboard
  - [ ] Controls: start, stop, fullscreen
- [ ] Write tests for relay and control endpoints

## Open Questions

- [ ] Is the U64 stream format documented anywhere, or is this purely reverse-engineering?
- [ ] What's the expected bandwidth? (320x200 @ 50fps uncompressed = ~3MB/s)
- [ ] Does the U64 stream use any compression?
- [ ] Can the stream be started/stopped via the REST API, or only via the device menu?

## References

- Spec: [Developer Tools](../specs/developer-tools/)
- C64U streams API: GET /v1/streams
- U64 hardware documentation (if available)
