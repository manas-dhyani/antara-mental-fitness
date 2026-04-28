# Antara Frontend

A lightweight responsive frontend for the Antara FastAPI backend.

## Features
- Register and login
- Journal entry creation and listing
- Chat with the AI endpoint
- Weekly insights view
- Token stored in `localStorage`

## Run
Serve the folder with any static server, for example:

```bash
python -m http.server 5173
```

Then open the page in your browser and set the API base URL if your backend is not running on `http://localhost:8000`.

## Backend endpoints used
- `POST /auth/register`
- `POST /auth/login`
- `GET /journal/`
- `POST /journal/`
- `POST /chat/message`
- `GET /insights/weekly`
