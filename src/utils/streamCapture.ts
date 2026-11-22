import { StreamPlatformConfig } from '../types';
import { audioHub } from './audioHub';

function sanitizeSingleQuotes(value: string): string {
  return value.replace(/'/g, "'\\''");
}

function buildRtmpDestination(platform: StreamPlatformConfig): string {
  const base = (platform.rtmpUrl || '').trim().replace(/\/+$/, '');
  const key = (platform.streamKey || '').trim() || `YOUR_${platform.id.toUpperCase()}_STREAM_KEY`;
  return `${base}/${key}`;
}

/**
 * Generates an FFmpeg multi-output (-f tee) command configured with all currently ON platforms.
 */
export function generateMultiStreamFfmpegCommand(
  activePlatforms: StreamPlatformConfig[],
  appUrl?: string
): string {
  if (activePlatforms.length === 0) {
    return '# Toggle at least one platform ON to generate a multi-stream FFmpeg command.';
  }

  const teeOutputs = activePlatforms
    .map((p) => `[f=flv:onfail=ignore]${buildRtmpDestination(p)}`)
    .join('|');

  const safeTee = sanitizeSingleQuotes(teeOutputs);
  const platformSummary = activePlatforms.map((p) => `${p.name} (${p.handle || p.id})`).join(', ');
  const resolvedUrl =
    appUrl || (typeof window !== 'undefined' ? window.location.href : 'https://your-arena-url.app');

  return `#!/usr/bin/env bash
# Country Flags Battle Arena — Multi-RTMP 24/7 Relay Script (Hugging Face Space / Linux)
# Active Platforms: ${platformSummary}
# Resolution: 1080x1920 (9:16 Vertical Stream) @ 30fps

set -e

APP_URL="${sanitizeSingleQuotes(resolvedUrl)}"
DISPLAY_NUM=":99"

# 1. Start virtual 9:16 display & audio sink (for headless Hugging Face Space / Docker)
Xvfb "$DISPLAY_NUM" -screen 0 1080x1920x24 &
pulseaudio --start --exit-idle-time=-1 || true
sleep 2

# 2. Launch Country Flags Battle Arena fullscreen in Chromium
chromium --display="$DISPLAY_NUM" --kiosk --no-sandbox --autoplay-policy=no-user-gesture-required \\
  --window-size=1080,1920 --window-position=0,0 "$APP_URL" &
sleep 4

# 3. Capture 9:16 video + game audio and multistream simultaneously via FFmpeg (-f tee)
ffmpeg -re \\
  -f x11grab -video_size 1080x1920 -framerate 30 -i "$DISPLAY_NUM.0" \\
  -f pulse -i default \\
  -c:v libx264 -preset veryfast -tune zerolatency \\
  -b:v 4500k -maxrate 4500k -bufsize 9000k -pix_fmt yuv420p -g 60 \\
  -c:a aac -b:a 128k -ar 44100 \\
  -map 0:v -map 1:a -flags +global_header \\
  -f tee '${safeTee}'`;
}

/**
 * Generates a concise single-line FFmpeg -f tee command for users piping an existing input/OBS stream.
 */
export function generateCompactTeeCommand(activePlatforms: StreamPlatformConfig[]): string {
  if (activePlatforms.length === 0) {
    return '# Toggle at least one platform ON first.';
  }
  const teeOutputs = activePlatforms
    .map((p) => `[f=flv:onfail=ignore]${buildRtmpDestination(p)}`)
    .join('|');
  const safeTee = sanitizeSingleQuotes(teeOutputs);

  return `ffmpeg -re -i input.mp4 -c:v libx264 -preset veryfast -b:v 4500k -maxrate 4500k -bufsize 9000k -pix_fmt yuv420p -g 60 -c:a aac -b:a 128k -ar 44100 -map 0:v -map 0:a -flags +global_header -f tee '${safeTee}'`;
}

export interface LiveCaptureState {
  isLive: boolean;
  hasVideoTrack: boolean;
  hasAudioTrack: boolean;
  recordedBlobUrl: string | null;
  error: string | null;
}

/**
 * Captures the live 9:16 HTML5 Canvas stream + Web Audio SFX/Music mix in-browser.
 */
export class LiveStreamCapturer {
  private combinedStream: MediaStream | null = null;
  private canvasStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private lastBlobUrl: string | null = null;

  public start(canvas: HTMLCanvasElement): LiveCaptureState {
    this.stop();

    try {
      if (typeof canvas.captureStream !== 'function') {
        return {
          isLive: true,
          hasVideoTrack: false,
          hasAudioTrack: false,
          recordedBlobUrl: null,
          error: null,
        };
      }

      const videoStream = canvas.captureStream(60);
      this.canvasStream = videoStream;

      const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
      const audioStream = audioHub.getCaptureAudioStream();
      let hasAudio = false;
      if (audioStream) {
        const audioTracks = audioStream.getAudioTracks();
        if (audioTracks.length > 0) {
          tracks.push(...audioTracks);
          hasAudio = true;
        }
      }

      this.combinedStream = new MediaStream(tracks);
      this.chunks = [];

      if (typeof MediaRecorder !== 'undefined') {
        const preferredTypes = [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
        ];
        const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t));
        try {
          this.recorder = mimeType
            ? new MediaRecorder(this.combinedStream, { mimeType, videoBitsPerSecond: 4_500_000 })
            : new MediaRecorder(this.combinedStream);

          this.recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) {
              this.chunks.push(ev.data);
            }
          };
          this.recorder.start(1000);
        } catch {
          this.recorder = null;
        }
      }

      return {
        isLive: true,
        hasVideoTrack: videoStream.getVideoTracks().length > 0,
        hasAudioTrack: hasAudio,
        recordedBlobUrl: null,
        error: null,
      };
    } catch (err) {
      return {
        isLive: false,
        hasVideoTrack: false,
        hasAudioTrack: false,
        recordedBlobUrl: null,
        error: err instanceof Error ? err.message : 'Failed to start canvas capture.',
      };
    }
  }

  public stop(): Promise<string | null> {
    return new Promise((resolve) => {
      const finalizeStreams = () => {
        if (this.canvasStream) {
          this.canvasStream.getTracks().forEach((t) => t.stop());
          this.canvasStream = null;
        }
        this.combinedStream = null;
      };

      if (this.recorder && this.recorder.state !== 'inactive') {
        const rec = this.recorder;
        this.recorder = null;
        rec.onstop = () => {
          finalizeStreams();
          if (this.chunks.length > 0) {
            if (this.lastBlobUrl) URL.revokeObjectURL(this.lastBlobUrl);
            const blob = new Blob(this.chunks, { type: rec.mimeType || 'video/webm' });
            this.lastBlobUrl = URL.createObjectURL(blob);
            this.chunks = [];
            resolve(this.lastBlobUrl);
          } else {
            resolve(null);
          }
        };
        try {
          rec.stop();
        } catch {
          finalizeStreams();
          resolve(null);
        }
      } else {
        this.recorder = null;
        finalizeStreams();
        resolve(null);
      }
    });
  }

  public destroy() {
    this.stop();
    if (this.lastBlobUrl) {
      URL.revokeObjectURL(this.lastBlobUrl);
      this.lastBlobUrl = null;
    }
  }
}
