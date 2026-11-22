import { StreamPlatformConfig } from '../types';

export const STREAM_PLATFORMS_STORAGE_KEY = 'cfba_stream_platforms_v1';

export const DEFAULT_STREAM_PLATFORMS: StreamPlatformConfig[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    enabled: true,
    handle: '@FlagsBattleArena',
    showHandleOnScreen: true,
    rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
    streamKey: '',
    brandColor: '#FF0033',
  },
  {
    id: 'twitch',
    name: 'Twitch',
    enabled: false,
    handle: '@flagsbattlearena',
    showHandleOnScreen: true,
    rtmpUrl: 'rtmp://live.twitch.tv/app',
    streamKey: '',
    brandColor: '#9146FF',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    enabled: false,
    handle: '@flagsbattlearena',
    showHandleOnScreen: true,
    rtmpUrl: 'rtmp://push.tiktokv.com/live',
    streamKey: '',
    brandColor: '#00F2EA',
  },
  {
    id: 'kick',
    name: 'Kick',
    enabled: false,
    handle: '@flagsbattlearena',
    showHandleOnScreen: true,
    rtmpUrl: 'rtmps://fa723fc1b171.global-contribute.live-video.net/app',
    streamKey: '',
    brandColor: '#53FC18',
  },
  {
    id: 'custom',
    name: 'Custom Platform',
    enabled: false,
    handle: '@MyLiveStream',
    showHandleOnScreen: true,
    rtmpUrl: 'rtmp://your-rtmp-server.com/live',
    streamKey: '',
    brandColor: '#38BDF8',
  },
];

export function loadStreamPlatforms(): StreamPlatformConfig[] {
  try {
    const raw = localStorage.getItem(STREAM_PLATFORMS_STORAGE_KEY);
    if (!raw) return DEFAULT_STREAM_PLATFORMS;
    const parsed = JSON.parse(raw) as Partial<StreamPlatformConfig>[];
    if (!Array.isArray(parsed)) return DEFAULT_STREAM_PLATFORMS;

    return DEFAULT_STREAM_PLATFORMS.map((def) => {
      const saved = parsed.find((item) => item && item.id === def.id);
      if (!saved) return def;
      return {
        ...def,
        name: typeof saved.name === 'string' && saved.name.trim() ? saved.name : def.name,
        enabled: typeof saved.enabled === 'boolean' ? saved.enabled : def.enabled,
        handle: typeof saved.handle === 'string' ? saved.handle : def.handle,
        showHandleOnScreen:
          typeof saved.showHandleOnScreen === 'boolean'
            ? saved.showHandleOnScreen
            : def.showHandleOnScreen,
        rtmpUrl: typeof saved.rtmpUrl === 'string' ? saved.rtmpUrl : def.rtmpUrl,
        streamKey: typeof saved.streamKey === 'string' ? saved.streamKey : def.streamKey,
      };
    });
  } catch {
    return DEFAULT_STREAM_PLATFORMS;
  }
}

export function saveStreamPlatforms(platforms: StreamPlatformConfig[]) {
  try {
    localStorage.setItem(STREAM_PLATFORMS_STORAGE_KEY, JSON.stringify(platforms));
  } catch {
    // Ignore storage quota errors
  }
}
