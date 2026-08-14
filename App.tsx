import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { useTheme } from './src/theme';
import { HomeScreen } from './src/screens/HomeScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { ExportScreen } from './src/screens/ExportScreen';
import { CameraScreen } from './src/screens/CameraScreen';
import { useScanStore } from './src/store/scanStore';

export default function App() {
  const screen = useScanStore((s) => s.screen);
  const loadSaves = useScanStore((s) => s.loadSaves);
  const c = useTheme();
  const darkContent = screen !== 'scan' && c.bg === '#F6F7F9';

  useEffect(() => {
    loadSaves();
  }, [loadSaves]);

  return (
    <>
      <StatusBar
        barStyle={darkContent ? 'dark-content' : 'light-content'}
        backgroundColor={screen === 'scan' ? '#000000' : c.bg}
      />
      {screen === 'home' && <HomeScreen />}
      {screen === 'scan' && <ScanScreen />}
      {screen === 'result' && <ResultScreen />}
      {screen === 'library' && <LibraryScreen />}
      {screen === 'export' && <ExportScreen />}
      {screen === 'camera' && <CameraScreen />}
    </>
  );
}
