import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.uk.castleandcoastline',
  appName: 'Castle and Coastline',
  webDir: 'build',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0d1520',
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0d1520',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      spinnerColor: '#c9a96e',
    },
  },
};

export default config;
