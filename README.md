# n8n Dashboard

A full-stack web application that provides a custom dashboard interface for managing and monitoring n8n workflows with user authentication and authorization.

> **Architecture note:** the React frontend never talks to n8n directly. All n8n API calls (list/activate/deactivate workflows, list executions) go through the Node.js backend at `/api/n8n/*`, which is the only place holding the n8n API key. This keeps the key out of the browser bundle and lets the backend enforce per-user authorization (via the `tag` field).

## 🚀 Features

- **User Authentication**: Secure login system with JWT tokens
- **n8n Integration**: Direct integration with n8n API for workflow management
- **Real-time Monitoring**: View and manage n8n workflows, executions, and credentials
- **User Management**: Multi-user support with role-based access control
- **Responsive Design**: Modern, mobile-friendly interface
- **Docker Support**: Easy deployment with Docker and Docker Compose
- **PostgreSQL Database**: Robust data persistence layer

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (version 16 or higher)
- **npm** or **yarn**
- **PostgreSQL** (version 12 or higher)
- **Docker & Docker Compose** (for containerized deployment)
- **n8n** instance running and accessible

## 🛠️ Installation

### Development Setup

#### 1. Clone the repository

```bash
git clone <repository-url>
cd n8n-dashboard
```

#### 2. Install frontend dependencies

```bash
npm install
```

#### 3. Install backend dependencies

```bash
cd backend
npm install
cd ..
```

#### 4. Configure environment variables

**Frontend (.env):**
```bash
cp .env.example .env
```

Edit `.env` and set:
```env
REACT_APP_BACKEND_URL=http://localhost:4000
```

**Backend (backend/.env):**
```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set:
```env
PORT=4000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=n8n_dashboard
DB_USER=postgres
DB_PASSWORD=your_postgres_password
JWT_SECRET=your-secure-random-string-at-least-64-characters-long
JWT_EXPIRES_IN=8h
CORS_ORIGIN=http://localhost:3000
N8N_BASE_URL=http://localhost:5678
N8N_API_HEADER=X-N8N-API-KEY
N8N_API_KEY=your_n8n_api_key
```

#### 5. Set up the database

Create a PostgreSQL database:
```bash
createdb n8n_dashboard
```

The backend automatically applies its versioned SQL migrations (`backend/src/db/migrations/`) on startup.

#### 6. Create an admin user

```bash
cd backend
npm run create-user
cd ..
```

Follow the prompts to create your first user.

#### 7. Start the development servers

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

### Docker Deployment

#### Quick Start (using helper scripts)

```bash
# Start all services
./docker-start.sh

# Create a user
./docker-create-user.sh

# View logs
./docker-logs.sh

# Stop all services
./docker-stop.sh
```

#### Manual Docker Deployment

#### 1. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your configuration (database password, `JWT_SECRET`, `N8N_API_KEY`, etc.). `docker compose` loads this file automatically.

#### 2. Start all services

```bash
docker compose up -d --build
```

This single command starts:
- PostgreSQL (internal network only — not exposed to the host, for security)
- Backend API (port 4000), waits for Postgres to be healthy, then runs migrations
- Frontend/nginx (port 3000), waits for the backend to be healthy

All three services have Docker healthchecks, and `restart: unless-stopped` so the stack recovers automatically after a host reboot or container crash.

#### 3. Create an admin user

```bash
docker compose exec backend npm run create-user
```

#### 4. Access the application

Open your browser and navigate to:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

#### Using Docker Helper Scripts

The project includes several helper scripts to simplify Docker operations:

- **`docker-start.sh`** - Build and start all containers
- **`docker-stop.sh`** - Stop all containers
- **`docker-create-user.sh`** - Create a user in the running backend container
- **`docker-logs.sh`** - View logs (optionally specify service name, e.g. `./docker-logs.sh backend`)

## 📁 Project Structure

```
n8n-dashboard/
├── backend/                 # Backend Node.js/Express application
│   ├── src/
│   │   ├── index.js        # Main server file
│   │   ├── db.js           # PostgreSQL connection pool
│   │   ├── db/
│   │   │   ├── migrate.js     # Migration runner
│   │   │   └── migrations/    # Versioned SQL migrations
│   │   ├── middleware/
│   │   │   └── auth.js     # JWT auth guard for protected routes
│   │   ├── services/
│   │   │   └── n8nClient.js # Server-side n8n API client (holds the API key)
│   │   └── routes/         # API routes
│   │       ├── auth.js     # Authentication endpoints
│   │       └── n8n.js      # n8n proxy endpoints (auth required)
│   ├── scripts/
│   │   └── create-user.js  # User creation script
│   ├── Dockerfile          # Backend Docker configuration
│   ├── .dockerignore       # Backend Docker ignore file
│   ├── package.json
│   ├── .env.example
│   └── .env
├── public/                  # Static files
├── src/                     # React frontend source
│   ├── App.js              # Main application component
│   ├── App.css             # Application styles
│   └── index.js            # React entry point
├── docker-compose.yaml      # Docker Compose (single stack: db + backend + frontend)
├── Dockerfile.frontend      # Frontend Docker configuration
├── nginx.conf              # Nginx configuration for production
├── .dockerignore           # Docker ignore file
├── docker-start.sh         # Helper script to start containers
├── docker-stop.sh          # Helper script to stop containers
├── docker-create-user.sh   # Helper script to create users
├── docker-logs.sh          # Helper script to view logs
├── .env                    # Shared env vars (docker-compose + CRA dev)
├── .env.example            # Environment template
├── .gitignore
└── README.md
```

## 🔌 API Endpoints

### Authentication

- `POST /api/auth/login` - User login
  ```json
  {
    "login": "user@example.com",
    "password": "password"
  }
  ```

- `GET /api/auth/verify` - Verify the current JWT (sent as `Authorization: Bearer <token>`)

### n8n proxy (all require `Authorization: Bearer <token>`)

- `GET /api/n8n/status` - n8n connectivity check
- `GET /api/n8n/workflows` - List workflows (filtered by the user's `tag`, unless `tag=admin`)
- `POST /api/n8n/workflows/:id/activate` - Activate a workflow
- `POST /api/n8n/workflows/:id/deactivate` - Deactivate a workflow
- `GET /api/n8n/executions?workflowId=:id` - List executions for a workflow

### Health Check

- `GET /api/health` - Check API + database health status

## 🔧 Configuration

### Frontend Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REACT_APP_BACKEND_URL` | Backend API URL | `http://localhost:4000` |

### Backend Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `4000` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `n8n_dashboard` |
| `DB_USER` | Database user | `postgres` |
| `DB_PASSWORD` | Database password | - |
| `JWT_SECRET` | Secret for JWT signing | - |
| `JWT_EXPIRES_IN` | JWT expiration time | `8h` |
| `CORS_ORIGIN` | Allowed CORS origins | `http://localhost:3000` |
| `N8N_BASE_URL` | n8n instance URL, reachable from the backend | `http://localhost:5678` |
| `N8N_API_KEY` | n8n API key (server-side only) | - |
| `N8N_API_HEADER` | n8n API header name | `X-N8N-API-KEY` |

## 🧪 Testing

```bash
npm test
```

## 📦 Building for Production

### Frontend

```bash
npm run build
```

This creates an optimized production build in the `build/` folder.

### Docker

```bash
docker compose up -d --build
```

## 🌐 Network Access

To access the dashboard from other devices on your network:

1. Update environment variables with your server's IP:
   ```env
   REACT_APP_BACKEND_URL=http://192.168.1.100:4000
   ```

2. Start the frontend with LAN access:
   ```bash
   npm run start:lan
   ```

## 🐛 Troubleshooting

### Database Connection Issues

- Ensure PostgreSQL is running
- Verify database credentials in `.env`
- Check if the database exists

### CORS Errors

- Ensure `CORS_ORIGIN` in backend `.env` includes your frontend URL
- Update allowed origins if accessing from different domains

### n8n API Connection

- Verify n8n is running and accessible from the **backend** container/host (`N8N_BASE_URL`)
- Check `N8N_API_KEY` is valid (test with `GET /api/n8n/status` while logged in)
- If n8n runs on the Docker host, `N8N_BASE_URL=http://host.docker.internal:5678` requires the `extra_hosts: host.docker.internal:host-gateway` entry already present on the `backend` service in `docker-compose.yaml`

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with [Create React App](https://create-react-app.dev/)
- Powered by [n8n](https://n8n.io/)
- Uses [Express.js](https://expressjs.com/) for the backend
- Database: [PostgreSQL](https://www.postgresql.org/)

## 📧 Support

For support, please open an issue in the GitHub repository.
