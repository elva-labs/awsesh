import { createSignal, onMount, type Component } from 'solid-js';
import './styles.css';

declare global {
  interface Window {
    __TAURI__: unknown;
  }
}

const isDesktop = typeof window !== 'undefined' && window.__TAURI__ !== undefined;

interface PlatformInfo {
  isDesktop: boolean;
  platform: string;
}

const getPlatformInfo = (): PlatformInfo => ({
  isDesktop: isDesktop,
  platform: isDesktop ? 'desktop' : 'browser',
});

const App: Component = () => {
  const [platform, setPlatform] = createSignal<PlatformInfo>(getPlatformInfo());

  onMount(async () => {
    if (isDesktop) {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const version = await getVersion();
        console.log('AWSESH Desktop Version:', version);
      } catch {
        console.log('Tauri API not available');
      }
    }
  });

  return (
    <div className="container">
      <h1>AWSESH</h1>
      <p>Platform: {platform().platform}</p>
      <p>Desktop: {platform().isDesktop ? 'Yes' : 'No'}</p>
    </div>
  );
};

export default App;
