# Virtual Career Fair

Web app for hosting virtual career fairs where students and employers can connect.

## Quick start (frontend)
```bash
cd frontend
npm install
npm run dev
```

## Quick start (backend)
```bash
cd backend
npm install
node server.js
```

The backend server will start at http://localhost:5000

### API Endpoints
- `GET /` - Health check endpoint, returns "Backend is running!"

## Development Setup
To run the full application:

1. Start the backend server:
```bash
cd backend
npm install
node server.js
```

2. In a new terminal, start the frontend:
```bash
cd frontend
npm install
npm run dev
```

The frontend will automatically connect to the backend at http://localhost:5000.
You can verify the connection by checking your browser's console for the "Backend is running!" message.

## Branching
- `dev` — active development
- `main` — stable / release

## Contributing
1. Create `feature/<name>` branches off `dev`.
2. Open PRs to `dev` and request reviews.
