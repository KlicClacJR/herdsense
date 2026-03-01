import { useEffect, useMemo, useState } from 'react';
import { BellRing, BriefcaseBusiness, Settings, Users } from 'lucide-react';
import { APP_NAME } from './data/constants';
import { useFarmData } from './hooks/useFarmData';
import { useAlerts } from './hooks/useAlerts';
import HealthAlertsPage from './components/HealthAlertsPage';
import OptimizationProPage from './components/OptimizationProPage';
import HerdManagerPage from './components/HerdManagerPage';
import SettingsPage from './components/SettingsPage';
import './App.css';

const TABS = [
  { id: 'health', label: 'Health & Alerts', icon: BellRing },
  { id: 'optimization', label: 'Optimization (Pro)', icon: BriefcaseBusiness },
  { id: 'manager', label: 'Herd Manager', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [screen, setScreen] = useState('health');
  const farm = useFarmData();
  const alertOptions = useMemo(
    () => ({
      baselineRecalibrationActive: farm.baselineRecalibrationDaysLeft > 0,
      demoMode: Boolean(farm.settings?.demo_mode),
      demoTargetEarTag: 'EA-1001',
      demoClickCount: Number(farm.demoClickCount || 0),
    }),
    [farm.baselineRecalibrationDaysLeft, farm.settings?.demo_mode, farm.demoClickCount]
  );

  const alertsData = useAlerts(
    farm.activeCows,
    farm.todaySignalsByTag,
    farm.baselinesByTag,
    farm.dayKey,
    alertOptions,
    farm.riskTrackerByCow,
    farm.detectionsToday
  );

  useEffect(() => {
    farm.syncRiskTracker(alertsData.nextRiskTrackerByCow);
  }, [alertsData.nextRiskTrackerByCow, farm.syncRiskTracker]);

  return (
    <div className="app">
      <header className="topbar">{APP_NAME}</header>

      <main className="main-content">
        {screen === 'health' && (
          <HealthAlertsPage
            cows={farm.activeCows}
            todaySignalsByTag={farm.todaySignalsByTag}
            baselinesByTag={farm.baselinesByTag}
            detectionsToday={farm.detectionsToday}
            alertsData={alertsData}
            onSimulateDay={farm.simulateDay}
            onAddDetectedTag={farm.addDetectedTag}
            onResetDemo={farm.resetDemo}
            onSetDemoMode={farm.setDemoMode}
            demoMode={farm.settings.demo_mode}
            baselineRecalibrationDaysLeft={farm.baselineRecalibrationDaysLeft}
            hardwareIssue={alertsData.hardwareIssue}
            settings={farm.settings}
            lastSyncTime={farm.lastSyncTime}
            onCreateServiceTicket={farm.createServiceTicket}
          />
        )}

        {screen === 'optimization' && (
          <OptimizationProPage
            cows={farm.activeCows}
            todaySignalsByTag={farm.todaySignalsByTag}
            historyByTag={farm.historyByTag}
            baselinesByTag={farm.baselinesByTag}
            settings={farm.settings}
            insights={alertsData.insights}
            taskOccurrences={farm.taskOccurrences}
            taskHistory={farm.taskHistory}
            onTogglePro={farm.setProEnabled}
            onUpdateSetting={farm.updateSetting}
            onUpdateMilk={farm.updateMilkLiters}
            onMarkTaskDone={farm.markTaskDone}
            onMarkTaskSkipped={farm.markTaskSkipped}
            onAddCustomTask={farm.addCustomTask}
            onAddMilkingReminders={farm.addMilkingReminders}
            onGenerateRecommendedTasks={farm.generateRecommendedTasks}
            onUpdateCowMilkingOverride={farm.updateCowMilkingOverride}
            onUpdateCow={farm.updateCow}
          />
        )}

        {screen === 'manager' && (
          <HerdManagerPage
            activeCows={farm.activeCows}
            pastCows={farm.pastCows}
            onAddCow={farm.addCow}
            onUpdateCow={farm.updateCow}
            onDeleteCow={farm.deleteCow}
            onArchiveCow={farm.archiveCow}
            onRestoreCow={farm.restoreCow}
          />
        )}

        {screen === 'settings' && (
          <SettingsPage
            settings={farm.settings}
            baselineRecalibrationDaysLeft={farm.baselineRecalibrationDaysLeft}
            onUpdateSetting={farm.updateSetting}
            onSetDemoMode={farm.setDemoMode}
            serviceTickets={farm.serviceTickets}
            onCreateServiceTicket={farm.createServiceTicket}
            onUpdateServiceTicketStatus={farm.updateServiceTicketStatus}
            lastSyncTime={farm.lastSyncTime}
          />
        )}
      </main>

      <nav className="bottom-nav four-tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              className={`nav-tab ${screen === tab.id ? 'active' : ''}`}
              onClick={() => setScreen(tab.id)}
            >
              <Icon size={20} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
