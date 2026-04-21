export type ProjectXSdkConfig = {
  apiUrl: string;
  socketUrl: string;
  platformApiKey: string;
};

export const PROJECT_X_SDK_CONFIG_PRESETS = {
  androidEmulator: {
    apiUrl: 'http://10.0.2.2:4575/api/v1',
    socketUrl: 'http://10.0.2.2:4575',
    platformApiKey: '123456678',
  },
  ngrok: {
    apiUrl: 'https://tilt-tiger-recliner.ngrok-free.dev/api/v1',
    socketUrl: 'https://tilt-tiger-recliner.ngrok-free.dev',
    platformApiKey: '123456678',
  },
  lan: {
    apiUrl: 'http://192.168.1.10:4575/api/v1',
    socketUrl: 'http://192.168.1.10:4575',
    platformApiKey: '123456678',
  },
} as const satisfies Record<string, ProjectXSdkConfig>;

export const PROJECT_X_SDK_CONFIG: ProjectXSdkConfig =
  PROJECT_X_SDK_CONFIG_PRESETS.ngrok;
