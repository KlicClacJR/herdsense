import { useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { LayoutDashboard, Users, Bell, Play, FileText, Calendar } from 'lucide-react';
import { useAnimals } from './hooks/useAnimals';
import { useAlerts } from './hooks/useAlerts';
import { useSchedules } from './hooks/useSchedules';
import Dashboard from './components/Dashboard';
import AnimalProfiles from './components/AnimalProfiles';
import AlertsFeed from './components/AlertsFeed';
import Playback from './components/Playback';
import Reports from './components/Reports';
import Schedule from './components/Schedule';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'animals', label: 'Animals', icon: Users },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'playback', label: 'Playback', icon: Play },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
];

function Placeholder({ title }) {
  return (
    <div className="screen">
      <header className="screen-header">
        <h1>{title}</h1>
      </header>
      <div
        style={{
          background: '#f8faf8',
          border: '1px solid #e0e6e2',
          borderRadius: 12,
          padding: 16,
          color: '#1a1a1a',
        }}
      >
        Coming next…
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState('animals');
  const animalsData = useAnimals();
  const alerts = useAlerts(animalsData.animals);
  const schedulesData = useSchedules(animalsData.animals);

  return (
    <div className="app">
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 600,
          background: '#ffffff',
          borderBottom: '1px solid #e0e6e2',
          padding: '10px 16px',
          fontWeight: 800,
          color: '#2D6A4F',
        }}
      >
        HerdSense
      </div>
      <main className="main-content">
        <ErrorBoundary>
          {screen === 'dashboard' && (
            <Dashboard
              animals={animalsData.animals}
              movements={animalsData.movements}
              getCurrentPosition={animalsData.getCurrentPosition}
            />
          )}
          {screen === 'animals' && (
            <AnimalProfiles
              animals={animalsData.animals}
              addAnimal={animalsData.addAnimal}
              updateAnimal={animalsData.updateAnimal}
              deleteAnimal={animalsData.deleteAnimal}
            />
          )}
          {screen === 'alerts' && <AlertsFeed alerts={alerts} animals={animalsData.animals} />}
          {screen === 'playback' && (
            <Playback animals={animalsData.animals} movements={animalsData.movements} />
          )}
          {screen === 'reports' && (
            <Reports animals={animalsData.animals} movements={animalsData.movements} />
          )}
          {screen === 'schedule' && (
            <Schedule
              schedules={schedulesData.schedules}
              addSchedule={schedulesData.addSchedule}
              removeSchedule={schedulesData.removeSchedule}
              updateSchedule={schedulesData.updateSchedule}
              animals={animalsData.animals}
            />
          )}
        </ErrorBoundary>
      </main>

      <nav className="bottom-nav">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const badge = tab.id === 'schedule' && schedulesData.upcomingCount > 0;
          return (
            <button
              key={tab.id}
              className={`nav-tab ${screen === tab.id ? 'active' : ''}`}
              onClick={() => setScreen(tab.id)}
              type="button"
            >
              <span className="nav-icon-wrap">
                <Icon size={22} />
                {badge && (
                  <span className="nav-badge">{Math.min(schedulesData.upcomingCount, 9)}</span>
                )}
              </span>
              <span className="nav-label">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
