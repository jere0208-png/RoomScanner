import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { HomeScreen } from './src/screens/HomeScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { useScanStore } from './src/store/scanStore';

export default function App() {
  const screen = useScanStore((s) => s.screen);
  const loadSaves = useScanStore((s) => s.loadSaves);

  useEffect(() => {
    loadSaves();
  }, [loadSaves]);

  return (
    <>
      <StatusBar
        barStyle={screen === 'scan' ? 'light-content' : 'dark-content'}
        backgroundColor={screen === 'scan' ? '#000000' : '#F6F7F9'}
      />
      {screen === 'home' && <HomeScreen />}
      {screen === 'scan' && <ScanScreen />}
      {screen === 'result' && <ResultScreen />}
      {screen === 'library' && <LibraryScreen />}
    </>
  );
}
