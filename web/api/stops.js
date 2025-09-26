// Temporary API route for stops
export default async function handler(req, res) {
  try {
    // Mock stops data - replace with real GTFS data later
    const stops = [
      { id: 'ALINGA1', name: 'Alinga Street 1' },
      { id: 'ALINGA2', name: 'Alinga Street 2' },
      { id: 'CIVIC1', name: 'Civic 1' },
      { id: 'CIVIC2', name: 'Civic 2' },
      { id: 'GUNGAHLIN1', name: 'Gungahlin Place 1' },
      { id: 'GUNGAHLIN2', name: 'Gungahlin Place 2' }
    ];
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    res.status(200).json(stops);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load stops' });
  }
}
