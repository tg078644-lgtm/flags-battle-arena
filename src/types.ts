export type GameMode = 'classic' | 'shrinking' | 'chaos';

export type FlagPreset = 'all' | 'top50' | 'top20' | 'custom';

export interface CountryFlag {
  id: string;
  code: string; // ISO 2-letter lowercase or custom short code
  name: string;
  imageUrl: string;
  fallbackColor: string;
  fallbackAccent: string;
  isCustom?: boolean;
}

export interface PhysicsSettings {
  spinSpeed: number; // Multiplier 0.2 - 4.0 (default 1.0)
  gapAngleDeg: number; // Degrees 18 - 120 (default 46)
  bounciness: number; // Restitution 0.45 - 1.15 (default 0.92)
}

export interface EliminatedEntry {
  flag: CountryFlag;
  rank: number; // e.g., 195th, 194th... 2nd
  timestamp: number;
}

export interface WinRecord {
  id: string;
  code: string;
  name: string;
  imageUrl: string;
  fallbackColor: string;
  wins: number;
  lastWonAt: number;
  isCustom?: boolean;
}

export interface ArenaSnapshot {
  aliveCount: number;
  totalCount: number;
  ringScale: number; // 1.0 down to minScale in shrinking mode
  chaosBoostActive: boolean;
  elapsedSeconds: number;
}

export type StreamPlatformId = 'youtube' | 'twitch' | 'tiktok' | 'kick' | 'custom';

export interface StreamPlatformConfig {
  id: StreamPlatformId;
  name: string;
  enabled: boolean;
  handle: string;
  showHandleOnScreen: boolean;
  rtmpUrl: string;
  streamKey: string;
  brandColor: string;
}

