import { useMemo } from 'react';
import { SPECIES_EMOJI } from '../data/constants';

const URGENCY_ORDER = { urgent: 0, security: 1, atRisk: 2, monitor: 3, healthy: 4 };

export function useAlerts(animals) {
  return useMemo(() => {
    const alerts = [
      {
        id: 'luna-urgent',
        animalId: 'luna',
        animalName: 'Luna',
        emoji: '🐄',
        type: 'urgent',
        message: '🚨 Urgent: Luna may be in calving distress — check immediately',
        confidence: 94,
        timeframe: 'Immediate',
        action: 'Check Luna in person; contact vet if labor appears stalled.',
        timestamp: Date.now() - 3600000,
      },
      {
        id: 'bruno-security',
        animalId: 'bruno',
        animalName: 'Bruno',
        emoji: '🐷',
        type: 'security',
        message: '🚨 Bruno has left the farm boundary — possible theft or fence break',
        confidence: 91,
        timeframe: 'Immediate',
        action: 'Locate Bruno and inspect perimeter fencing.',
        timestamp: Date.now() - 1800000,
      },
      {
        id: 'bart-atrisk',
        animalId: 'bart',
        animalName: 'Bart',
        emoji: '🐐',
        type: 'atRisk',
        message: "⚠️ Bart's movement is 60% below normal — possible illness",
        confidence: 78,
        timeframe: 'Today',
        action: 'Observe Bart for appetite and behavior; consider vet visit.',
        timestamp: Date.now() - 7200000,
      },
      {
        id: 'maria-monitor',
        animalId: 'maria',
        animalName: 'Maria',
        emoji: '🐑',
        type: 'monitor',
        message: '👁️ Maria showing slightly reduced activity — monitor today',
        confidence: 65,
        timeframe: 'Today',
        action: 'Check again in a few hours; note any further decline.',
        timestamp: Date.now() - 14400000,
      },
    ];

    animals.forEach((a) => {
      const emoji = SPECIES_EMOJI[a.species] || '🐄';
      if (a.status === 'healthy' && !alerts.some((al) => al.animalId === a.id)) {
        alerts.push({
          id: `${a.id}-healthy`,
          animalId: a.id,
          animalName: a.name,
          emoji,
          type: 'healthy',
          message: `${a.name} is doing well — normal activity`,
          confidence: 92,
          timeframe: 'Ongoing',
          action: 'No action needed.',
          timestamp: Date.now() - 86400000,
        });
      }
    });

    alerts.sort((a, b) => {
      const orderA = URGENCY_ORDER[a.type] ?? 5;
      const orderB = URGENCY_ORDER[b.type] ?? 5;
      if (orderA !== orderB) return orderA - orderB;
      return (b.confidence || 0) - (a.confidence || 0);
    });
    return alerts;
  }, [animals]);
}
