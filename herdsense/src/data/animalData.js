/**
 * farmData.js
 * ES6 Module for Farm Animal Monitoring App
 */

// Generate realistic GPS data points using a random walk algorithm
const generateMovementData = () => {
    const data = {
      stella: [], // Cow - Healthy
      bart: [],   // Goat - At Risk
      maria: [],  // Sheep - Monitor
      bruno: [],  // Pig - Healthy
      luna: []    // Cow - Urgent
    };
  
    // Movement rules based on status
    const configs = {
      stella: { maxDelta: 0.008, minSteps: 180, maxSteps: 420 },
      bart:   { maxDelta: 0.002, minSteps: 15,  maxSteps: 75 },
      maria:  { maxDelta: 0.004, minSteps: 80,  maxSteps: 180 },
      bruno:  { maxDelta: 0.008, minSteps: 180, maxSteps: 420 },
      luna:   { maxDelta: 0.0003, minSteps: 0,  maxSteps: 5 } // Luna special case
    };
  
    // Base coordinates
    const startLat = 1.2921;
    const startLng = 36.8219;
    
    // Start exactly at 00:00 today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
  
    Object.keys(configs).forEach(animalKey => {
      let currentLat = startLat;
      let currentLng = startLng;
      const config = configs[animalKey];
  
      for (let i = 0; i < 48; i++) {
        // 30 minute intervals (30 mins * 60 secs * 1000 ms)
        const timestamp = new Date(today.getTime() + i * 30 * 60 * 1000).toISOString();
  
        // Calculate new position (previous position + bounded random delta)
        const latDelta = (Math.random() * 2 - 1) * config.maxDelta;
        const lngDelta = (Math.random() * 2 - 1) * config.maxDelta;
  
        currentLat += latDelta;
        currentLng += lngDelta;
  
        // Generate steps within boundaries
        const steps = Math.floor(Math.random() * (config.maxSteps - config.minSteps + 1)) + config.minSteps;
  
        data[animalKey].push({
          timestamp,
          lat: Number(currentLat.toFixed(6)),
          lng: Number(currentLng.toFixed(6)),
          steps
        });
      }
    });
  
    return data;
  };
  
  // Export the pre-generated movement data const
  export const ANIMAL_MOVEMENT_DATA = generateMovementData();
  
  export const DEMO_ANIMALS = [
    {
      id: 1, name: "Stella", species: "Cow", age: 4, 
      sex: "Female", weight: 420, status: "Healthy",
      confidence: 96, pregnancyStatus: "Not Pregnant",
      conditions: "None", lastActive: "2 mins ago",
      emoji: "🐄", purchasePrice: 800, gpsTag: "TAG-001"
    },
    {
      id: 2, name: "Bart", species: "Goat", age: 2,
      sex: "Male", weight: 35, status: "At Risk", 
      confidence: 78, pregnancyStatus: "Not Pregnant",
      conditions: "None", lastActive: "6 hrs ago",
      emoji: "🐐", purchasePrice: 150, gpsTag: "TAG-002"
    },
    {
      id: 3, name: "Maria", species: "Sheep", age: 3,
      sex: "Female", weight: 65, status: "Monitor",
      confidence: 65, pregnancyStatus: "Not Pregnant", 
      conditions: "None", lastActive: "1 hr ago",
      emoji: "🐑", purchasePrice: 200, gpsTag: "TAG-003"
    },
    {
      id: 4, name: "Bruno", species: "Pig", age: 1,
      sex: "Male", weight: 90, status: "Healthy",
      confidence: 98, pregnancyStatus: "Not Pregnant",
      conditions: "None", lastActive: "5 mins ago",
      emoji: "🐷", purchasePrice: 120, gpsTag: "TAG-004"
    },
    {
      id: 5, name: "Luna", species: "Cow", age: 6,
      sex: "Female", weight: 480, status: "Urgent",
      confidence: 94, pregnancyStatus: "Pregnant",
      conditions: "Pregnancy - due soon", lastActive: "6 hrs ago",
      emoji: "🐄", purchasePrice: 900, gpsTag: "TAG-005"
    }
  ];
  
  export const DEMO_ALERTS = [
    {
      id: 1, animalId: 5, animalName: "Luna", emoji: "🐄",
      type: "Health", severity: "Urgent",
      message: "Luna may be in calving distress — check immediately",
      confidence: 94,
      action: "Luna has been stationary for 6 hours with active pregnancy — possible calving complication. Arrange someone to check before noon.",
      timeframe: "Check within 1 hour",
      timestamp: "Today at 8:07 AM",
      color: "#D62828"
    },
    {
      id: 2, animalId: 2, animalName: "Bart", emoji: "🐐",
      type: "Health", severity: "At Risk",
      message: "Bart's movement is 60% below normal — possible illness",
      confidence: 78,
      action: "Check for signs of respiratory illness — labored breathing, nasal discharge, or fever. Separate from herd if confirmed.",
      timeframe: "Check today",
      timestamp: "Today at 9:32 AM",
      color: "#F4722B"
    },
    {
      id: 3, animalId: 3, animalName: "Maria", emoji: "🐑",
      type: "Health", severity: "Monitor",
      message: "Maria showing slightly reduced activity — monitor today",
      confidence: 65,
      action: "Check feed and water access. Monitor for next 24 hours and contact vet if activity drops further.",
      timeframe: "Monitor 24 hours",
      timestamp: "Today at 10:15 AM",
      color: "#F0A500"
    },
    {
      id: 4, animalId: 4, animalName: "Bruno", emoji: "🐷",
      type: "Security", severity: "Urgent",
      message: "Bruno has left the farm boundary — possible theft or fence break",
      confidence: 91,
      action: "Check the north fence line immediately. Bruno's last known position is 340 meters outside normal range.",
      timeframe: "Check within 1 hour",
      timestamp: "Today at 7:45 AM",
      color: "#7B2D8B"
    }
  ];  