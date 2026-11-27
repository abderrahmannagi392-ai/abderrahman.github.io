import type { CapacitorConfig } from '@capacitor/cli';

// Native Android & iOS app ("تدريبي") built from the same web code.
//
// The native shell loads the bundled files from `dist/` (no live server URL).
// The mobile screens are shown automatically inside the app (see src/lib/deviceMode.ts),
// and API calls go to the production API (VITE_API_BASE_URL or the default in src/utils/api.ts).
//
// Usage:
//   npm run cap:sync         # vite build + copy web files into android/ and ios/
//   npm run cap:android      # open the Android project in Android Studio
//   npm run cap:ios          # open the iOS project in Xcode (macOS only)
const config: CapacitorConfig = {
  appId: 'tadribi.com',
  appName: 'تدريبي',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1400,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#a4cc39',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
