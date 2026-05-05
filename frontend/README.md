# Virtual Career Fair — frontend

React + TypeScript SPA for the Virtual Career Fair: fairs, booths, employer dashboards, student flows, chat, and related UI.

Full-stack setup (backend, Firebase credentials, environment variables) is documented in the **repository root** [README.md](../README.md).

## Scripts

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies. |
| `npm run dev` | Vite dev server (default port **5173**); `/api` is proxied to `http://localhost:5000`. |
| `npm run build` | Typecheck and production build to `dist/`. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | ESLint. |
| `npm run format` | Prettier write. |
| `npm test` | Run Vitest once. |
| `npm run test:watch` | Vitest watch mode. |
| `npm run test:coverage` | Vitest with coverage. |

## Documentation

- **Doc index:** [docs/README.md](../docs/README.md)  
- **Testing guide:** [TEST_COVERAGE_GUIDE.md](../TEST_COVERAGE_GUIDE.md)
