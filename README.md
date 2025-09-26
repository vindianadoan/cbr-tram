# Canberra Metro Light Rail Tracker

A real-time web application for tracking Canberra's Light Rail services, featuring live vehicle positions, departure times, and an interactive map.

![Canberra Metro](https://img.shields.io/badge/Canberra-Metro-blue)
![React](https://img.shields.io/badge/React-19.1.1-blue)
![Node.js](https://img.shields.io/badge/Node.js-22.x-green)
![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black)

## 🚊 Live Demo

- **Production**: [https://cbr-tram-vindianadoans-projects.vercel.app](https://cbr-tram-vindianadoans-projects.vercel.app)
- **Latest**: [https://web-psi-three-36.vercel.app](https://web-psi-three-36.vercel.app)

## ✨ Features

- **Real-time Departures**: Live countdown timers for next light rail services
- **Interactive Map**: Live vehicle tracking with Leaflet maps
- **Stop Selection**: Easy dropdown to select any light rail stop
- **Auto-refresh**: Updates every 15 seconds with live data
- **Responsive Design**: Works on desktop and mobile devices
- **Fullscreen Map**: Toggle between normal and fullscreen map view
- **Fallback Data**: Graceful handling when real-time data is unavailable

## 🏗️ Architecture

This is a full-stack application with:

- **Frontend**: React + TypeScript + Vite + Leaflet
- **Backend**: Node.js + Express + GTFS-RT
- **Deployment**: Vercel (frontend) + Railway (backend)
- **Data Source**: ACT Government GTFS-RT feed

## 🚀 Quick Start

### Prerequisites

- Node.js 22.x or later
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/vindianadoan/cbr-tram.git
   cd cbr-tram
   ```

2. **Install dependencies**
   ```bash
   # Install root dependencies
   npm install
   
   # Install workspace dependencies
   npm install --workspace server
   npm install --workspace web
   ```

3. **Configure environment (optional)**
   
   Create `server/.env` for custom GTFS-RT configuration:
   ```bash
   GTFS_RT_TRIP_UPDATES_URL=http://files.transport.act.gov.au/feeds/lightrail.pb
   # Optional API key if required
   # GTFS_RT_API_KEY=Bearer <token>
   # Optional refresh interval (default: 15000ms)
   # FEED_TTL_MS=15000
   ```

4. **Run the application**
   ```bash
   # Option 1: Run both services together
   npm run dev
   
   # Option 2: Run services separately
   # Terminal 1 - Backend
   npm run dev:server
   
   # Terminal 2 - Frontend  
   npm run dev:web
   ```

5. **Open your browser**
   
   Navigate to [http://localhost:5173](http://localhost:5173) (or the port shown in terminal)

## 📁 Project Structure

```
cbr-tram/
├── server/                 # Backend API server
│   ├── src/
│   │   └── index.js       # Express server with GTFS-RT integration
│   ├── cbr-lightrail-concors/  # GTFS static data
│   │   ├── stops.txt      # Stop definitions
│   │   ├── routes.txt     # Route information
│   │   └── ...           # Other GTFS files
│   └── package.json
├── web/                   # Frontend React application
│   ├── src/
│   │   ├── App.tsx       # Main application component
│   │   ├── App.css       # Styling
│   │   └── main.tsx      # React entry point
│   └── package.json
├── .vercel/              # Vercel deployment configuration
├── railway.json          # Railway deployment configuration
└── package.json          # Root workspace configuration
```

## 🔌 API Endpoints

The backend provides the following REST API endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stops` | GET | List of all light rail stops for dropdown |
| `/api/departures?stopId={id}` | GET | Next 1-2 arrivals for a specific stop |
| `/api/stops-full` | GET | Stops with latitude/longitude coordinates |
| `/api/vehicles` | GET | Live vehicle positions from GTFS-RT feed |
| `/api/refresh` | POST | Force refresh of cached protobuf data |
| `/api/feed.pb` | GET | Raw protobuf feed bytes |
| `/api/rt-sample?n=5` | GET | Quick decoded sample of real-time data |

### Example API Usage

```bash
# Get all stops
curl http://localhost:4000/api/stops

# Get departures for stop 8129
curl http://localhost:4000/api/departures?stopId=8129

# Get live vehicle positions
curl http://localhost:4000/api/vehicles
```

## 🗺️ Data Sources

- **GTFS-RT Feed**: Real-time trip updates from ACT Government
- **GTFS Static Data**: Stop locations and route information
- **OpenStreetMap**: Map tiles for the interactive map

## 🚀 Deployment

### Frontend (Vercel)

The frontend is automatically deployed to Vercel:

1. **Connected to GitHub**: Pushes to `main` branch trigger deployments
2. **Build Command**: `npm run vercel-build` (runs `npm run build`)
3. **Output Directory**: `web/dist`
4. **Environment Variables**: Set `VITE_API_URL` to your backend URL

### Backend (Railway)

The backend is deployed on Railway:

1. **Start Command**: `cd server && npm start`
2. **Auto-restart**: Configured to restart on failure
3. **Environment**: Production environment variables set in Railway dashboard

## 🛠️ Development

### Available Scripts

```bash
# Root level
npm run dev          # Run both frontend and backend
npm run dev:server   # Run only backend
npm run dev:web      # Run only frontend

# Frontend (web/)
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint

# Backend (server/)
npm start            # Start production server
npm run dev          # Start development server
```

### Development Notes

- **Hot Reload**: Frontend supports hot module replacement
- **API Proxy**: Vite proxies `/api/*` requests to `http://localhost:4000`
- **CORS**: Backend configured with CORS for cross-origin requests
- **Logging**: Backend uses Pino for structured logging

## 🔧 Configuration

### Environment Variables

#### Frontend (`web/`)
- `VITE_API_URL`: Backend API URL (default: `/api` for development)

#### Backend (`server/`)
- `GTFS_RT_TRIP_UPDATES_URL`: GTFS-RT feed URL
- `GTFS_RT_API_KEY`: Optional API key for feed access
- `FEED_TTL_MS`: Cache TTL for protobuf data (default: 15000ms)
- `PORT`: Server port (default: 4000)

### GTFS Data

The application uses GTFS static data from `server/cbr-lightrail-concors/`:
- `stops.txt`: Platform stop definitions (location_type=0)
- `routes.txt`: Route information
- `trips.txt`: Trip definitions
- Other standard GTFS files

## 🐛 Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Vite will automatically try the next available port
   # Check terminal output for the actual port used
   ```

2. **API connection failed**
   ```bash
   # Ensure backend is running on port 4000
   # Check VITE_API_URL environment variable
   ```

3. **No real-time data**
   ```bash
   # Check GTFS-RT feed URL in server/.env
   # Verify network connectivity to ACT Government feed
   ```

4. **Map not loading**
   ```bash
   # Ensure internet connection for OpenStreetMap tiles
   # Check browser console for CORS errors
   ```

## 📱 Browser Support

- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **ACT Government** for providing the GTFS-RT feed
- **OpenStreetMap** contributors for map tiles
- **Leaflet** for the mapping library
- **React** and **Vite** for the frontend framework
- **Express** and **Node.js** for the backend

## 📞 Support

For issues and questions:
- Create an issue on [GitHub](https://github.com/vindianadoan/cbr-tram/issues)
- Check the [live demo](https://cbr-tram-vindianadoans-projects.vercel.app) for current status

---

**Built with ❤️ for Canberra's public transport users**