import React from 'react';
import { StatusBar } from 'react-native';
import { HomeScreen } from './src/screens/HomeScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { useScanStore } from './src/store/scanStore';

export default function App() {
  const screen = useScanStore((s) => s.screen);

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0e1116" />
      {screen === 'home' && <HomeScreen />}
      {screen === 'scan' && <ScanScreen />}
      {screen === 'result' && <ResultScreen />}
    </>
  );
}
