import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '../data/constants';

export function useSchedules(animals) {
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEYS.schedules) || '[]');
      setSchedules(Array.isArray(s) ? s : []);
    } catch {
      setSchedules([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.schedules, JSON.stringify(schedules));
  }, [schedules]);

  const addSchedule = useCallback((item) => {
    const id = `s-${Date.now()}`;
    setSchedules((prev) => [...prev, { ...item, id }]);
    return id;
  }, []);

  const removeSchedule = useCallback((id) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const updateSchedule = useCallback((id, updates) => {
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }, []);

  const upcomingCount = schedules.filter((s) => {
    const d = new Date(s.date);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d >= now && d.getTime() - now.getTime() <= 7 * 86400000;
  }).length;

  return { schedules, setSchedules, addSchedule, removeSchedule, updateSchedule, upcomingCount };
}
