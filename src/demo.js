export const demoGraph = {
  version: 1,
  repository: {
    name: 'ppastabtw/Neural-Network-Playground',
    title: 'Neural Network Playground',
    url: 'https://github.com/ppastabtw/Neural-Network-Playground',
    revision: '35f2c6460bea57629f4188eee759e2bebd3e4554'
  },
  nodes: [
    { id: 'web', title: 'Playground UI', type: 'frontend', tech: 'React',
      role: 'Builds models and shows live training progress',
      evidence: ['src/frontend/src/pages/ModelBuilder.jsx', 'src/frontend/src/components/TrainingPanel.jsx'] },
    { id: 'gateway', title: 'Nginx', type: 'gateway', tech: 'Nginx',
      role: 'Serves the React app and forwards API calls',
      evidence: ['deploy/nginx.conf'] },
    { id: 'api', title: 'Playground API', type: 'api', tech: 'FastAPI',
      role: 'Manages models, datasets, and training sessions',
      evidence: ['src/backend/api/main.py', 'src/backend/api/routes/models.py', 'src/backend/api/routes/training.py'] },
    { id: 'engine', title: 'Training Engine', type: 'worker', tech: 'PyTorch · in-process',
      role: 'Trains neural networks on selected datasets',
      evidence: ['src/backend/training/engine.py', 'src/backend/api/routes/training.py'] },
    { id: 'db', title: 'PostgreSQL', type: 'database', tech: 'PostgreSQL',
      role: 'Stores model configs, sessions, and metrics',
      evidence: ['src/backend/db_models.py', 'src/backend/database.py', 'src/backend/api/core/config.py'] }
  ],
  edges: [
    { from: 'web', to: 'gateway', label: 'HTTP', flow: 'Sends API requests',
      evidence: ['src/frontend/src/services/api.js', 'deploy/nginx.conf'] },
    { from: 'gateway', to: 'api', label: 'HTTP', flow: 'Proxies /api',
      evidence: ['deploy/nginx.conf', 'deploy/nn-playground.service'] },
    { from: 'api', to: 'engine', label: 'Calls', flow: 'Runs training jobs',
      evidence: ['src/backend/api/routes/training.py', 'src/backend/training/engine.py'] },
    { from: 'api', to: 'db', label: 'Reads / writes', flow: 'Saves runs and metrics',
      evidence: ['src/backend/api/routes/training.py', 'src/backend/database.py', 'src/backend/db_models.py'] }
  ],
  notes: []
};
