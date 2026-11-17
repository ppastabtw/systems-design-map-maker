const repository = {
  name: 'ppastabtw/Neural-Network-Playground',
  title: 'Neural Network Playground',
  url: 'https://github.com/ppastabtw/Neural-Network-Playground',
  revision: '35f2c6460bea57629f4188eee759e2bebd3e4554'
};

const frontend = 'src/frontend/src/';
const backend = 'src/backend/';
const trainingRoutes = backend + 'api/routes/training.py';
const datasetRoutes = backend + 'api/routes/datasets.py';
const modelRoutes = backend + 'api/routes/models.py';
const engine = backend + 'training/engine.py';
const canvas = frontend + 'components/ModelCanvas.jsx';
const modelContext = frontend + 'context/ModelContext.jsx';
const datasetSelector = frontend + 'components/DatasetSelector.jsx';
const trainingPanel = frontend + 'components/TrainingPanel.jsx';
const testingPanel = frontend + 'components/TestingPanel.jsx';
const requests = frontend + 'services/modelApi.js';
const database = backend + 'db_models.py';

const components = {
  builder: { title: 'Model Builder', type: 'frontend', tech: 'React · browser',
    role: 'Design layers and choose a dataset',
    detail: 'Add layers, adjust their settings, or load a starter template. The selected dataset determines the input and output shape.',
    evidence: [canvas, modelContext, datasetSelector] },
  templates: { title: 'Starter Templates', type: 'library', tech: 'React · browser',
    role: 'Provides editable starter architectures',
    detail: 'The model canvas offers preset layer stacks. Loading one replaces the current layers in the shared model state.',
    evidence: [canvas, modelContext] },
  datasets: { title: 'Dataset Catalog', type: 'library', tech: 'Python dataset loaders',
    role: 'Lists, previews, and loads datasets',
    detail: 'The registry covers MNIST, Iris, California Housing, Wine Quality, and synthetic data. Dataset APIs expose previews and recommended training settings.',
    evidence: [datasetRoutes, backend + 'datasets/registry.py', backend + 'datasets/__init__.py'] },
  configuration: { title: 'Model Configuration', type: 'service', tech: 'React Context · browser',
    role: 'Shares the chosen dataset and layers',
    detail: 'The model builder updates shared state. The training panel reads that state and includes the dataset and full layer list in its training request.',
    evidence: [modelContext, canvas, trainingPanel] },
  controls: { title: 'Training Panel', type: 'frontend', tech: 'React · browser',
    role: 'Starts, pauses, resumes, or stops training',
    detail: 'Sends the learning rate, epochs, batch size, and optimizer settings. While a run is active it polls the status endpoint every 1.5 seconds.',
    evidence: [trainingPanel, requests] },
  charts: { title: 'Loss and Accuracy', type: 'frontend', symbol: 'chart', tech: 'React · Recharts',
    role: 'Charts how the model learns by epoch',
    detail: 'The training panel feeds metrics from status responses into the loss and accuracy charts.',
    evidence: [trainingPanel, frontend + 'components/LossGraph.jsx'] },
  api: { title: 'Playground API', type: 'api', tech: 'FastAPI',
    role: 'Connects model design, training, and testing',
    detail: 'The API exposes dataset, template, model, and training routes. Training and prediction run within the backend process.',
    evidence: [backend + 'api/main.py', modelRoutes, trainingRoutes] },
  jobs: { title: 'Training Jobs', type: 'service', tech: 'FastAPI · thread pool',
    role: 'Runs training jobs and reports progress',
    detail: 'Keeps active training engines in memory, submits them to a thread pool, and exposes session controls and per-epoch metrics.',
    evidence: [trainingRoutes, backend + 'training/models.py'] },
  engine: { title: 'Training Engine', type: 'worker', tech: 'PyTorch · in-process',
    role: 'Fits models on the selected dataset',
    detail: 'Loads training and test data, builds the configured MLP, and updates its weights while measuring loss and accuracy.',
    evidence: [engine, trainingRoutes] },
  mlp: { title: 'Dynamic MLP', type: 'library', symbol: 'network', tech: 'PyTorch · nn.Module',
    role: 'Turns layer settings into a neural network',
    detail: 'Builds a multilayer perceptron from the chosen layer sizes and activation functions.',
    evidence: [backend + 'models/dynamic_model.py', engine] },
  testing: { title: 'Testing Panel', type: 'frontend', tech: 'React · browser',
    role: 'Tries custom inputs and displays predictions',
    detail: 'Uses dataset-specific input forms, such as a drawing canvas for MNIST, and sends samples to the trained session.',
    evidence: [testingPanel, frontend + 'components/testing/MNISTCanvas.jsx', requests] },
  predict: { title: 'Prediction API', type: 'api', tech: 'FastAPI · training route',
    role: 'Looks up the session and predicts',
    detail: 'The prediction route validates that the session has a trained model, then passes the inputs to the training engine.',
    evidence: [trainingRoutes, engine] },
  trained: { title: 'Trained Model', type: 'service', symbol: 'network', tech: 'PyTorch · in memory',
    role: 'Uses learned weights to predict',
    detail: 'The trained model lives on the active training engine. Prediction applies the dataset’s preprocessing and runs a forward pass.',
    evidence: [engine, trainingRoutes] },
  export: { title: 'Python Export', type: 'library', tech: 'JavaScript · browser',
    role: 'Downloads the architecture as model.py',
    detail: 'Generates Python from the current layers and dataset dimensions. The browser previews the code and downloads it as a file.',
    evidence: [canvas, frontend + 'utils/modelExport.js', frontend + 'components/ExportPreviewModal.jsx'] },
  db: { title: 'PostgreSQL', type: 'database', tech: 'PostgreSQL · SQLAlchemy',
    role: 'Stores model configs, sessions, and metrics',
    detail: 'SQLAlchemy maps the model configurations, training sessions, and per-epoch metrics to separate database tables.',
    evidence: [database, backend + 'database.py', backend + 'api/core/config.py'] },
  web: { title: 'React App', type: 'frontend', tech: 'React · Vite',
    role: 'Runs the playground in the browser',
    evidence: [frontend + 'App.jsx', frontend + 'services/api.js'] },
  gateway: { title: 'Nginx', type: 'gateway', tech: 'Reverse proxy',
    role: 'Serves the site and forwards API requests',
    evidence: ['deploy/nginx.conf', 'deploy/nn-playground.service'] }
};

const connection = (from, to, flow, ...evidence) => ({ from, to, label: flow, evidence });

function view(id, label, title, ids, edges, note) {
  return {
    id, label,
    graph: {
      version: 1, repository, title,
      nodes: ids.map(id => ({ id, ...components[id] })),
      edges, notes: [note]
    }
  };
}

export const exampleViews = [
  view('overview', 'Overview', 'How Neural Network Playground works',
    ['builder', 'controls', 'testing', 'export', 'api', 'engine', 'datasets', 'db'], [
      connection('builder', 'api', 'Lists datasets', datasetSelector, datasetRoutes),
      connection('controls', 'api', 'Starts & polls', trainingPanel, trainingRoutes),
      connection('testing', 'api', 'Sends sample input', testingPanel, requests),
      connection('builder', 'export', 'Exports layer setup', canvas, frontend + 'utils/modelExport.js'),
      connection('api', 'engine', 'Trains & predicts', trainingRoutes, engine),
      connection('api', 'datasets', 'Reads catalog', datasetRoutes, backend + 'datasets/registry.py'),
      connection('api', 'db', 'Saves runs', trainingRoutes, database)
    ], 'Design a model, train it on a dataset, and test its predictions. The Python export uses the current layer setup.'),
  view('build', 'Build', 'Build a model',
    ['builder', 'templates', 'datasets', 'configuration', 'controls'], [
      connection('templates', 'builder', 'Supplies starter layers', canvas, modelContext),
      connection('builder', 'datasets', 'Lists datasets', datasetSelector, datasetRoutes),
      connection('builder', 'configuration', 'Updates model setup', canvas, modelContext),
      connection('configuration', 'controls', 'Provides model setup', modelContext, trainingPanel)
    ], 'Choose a dataset and arrange layers or load a template. The training panel reads the model setup from shared browser state.'),
  view('train', 'Train', 'Train a model and watch it learn',
    ['controls', 'charts', 'jobs', 'engine', 'datasets', 'mlp', 'db'], [
      connection('controls', 'jobs', 'Starts & polls', trainingPanel, trainingRoutes),
      connection('controls', 'charts', 'Plots epoch metrics', trainingPanel, frontend + 'components/LossGraph.jsx'),
      connection('jobs', 'engine', 'Runs in thread pool', trainingRoutes, engine),
      connection('jobs', 'db', 'Saves run metrics', trainingRoutes, database),
      connection('engine', 'datasets', 'Loads train/test data', engine, backend + 'datasets/registry.py'),
      connection('engine', 'mlp', 'Fits model weights', engine, backend + 'models/dynamic_model.py')
    ], 'The browser polls for progress. The backend trains in a thread pool and records session and epoch metrics.'),
  view('test-export', 'Test & export', 'Test predictions and export Python',
    ['testing', 'predict', 'trained', 'builder', 'export'], [
      connection('testing', 'predict', 'Sends sample input', testingPanel, requests),
      connection('predict', 'trained', 'Runs forward pass', trainingRoutes, engine),
      connection('builder', 'export', 'Exports layer setup', canvas, frontend + 'utils/modelExport.js')
    ], 'Testing uses a trained session. Export generates model.py from the current architecture in the browser.'),
  view('hosting', 'Hosting', 'How the playground is hosted',
    ['web', 'gateway', 'api', 'db'], [
      connection('web', 'gateway', 'Sends API requests', frontend + 'services/api.js', 'deploy/nginx.conf'),
      connection('gateway', 'api', 'Proxies /api', 'deploy/nginx.conf', 'deploy/nn-playground.service'),
      connection('api', 'db', 'Reads & writes', backend + 'database.py', database)
    ], 'Nginx serves the built React app and forwards API requests to FastAPI. PostgreSQL holds the project’s persistent data.')
];
