export const demoGraph = {
  version: 1,
  repository: { name: 'storefront' },
  nodes: [
    { id: 'web', title: 'Storefront Web', type: 'frontend', tech: 'Next.js', evidence: ['apps/web/package.json', 'apps/web/src/app/checkout/page.tsx'] },
    { id: 'api', title: 'Orders API', type: 'api', tech: 'Express', evidence: ['apps/api/package.json', 'apps/api/src/routes/orders.ts'] },
    { id: 'db', title: 'PostgreSQL', type: 'database', tech: 'Relational database', evidence: ['compose.yaml', 'apps/api/src/db.ts'] },
    { id: 'queue', title: 'Order Queue', type: 'queue', tech: 'Redis', evidence: ['compose.yaml', 'apps/api/src/queue.ts'] },
    { id: 'worker', title: 'Order Worker', type: 'worker', tech: 'BullMQ', evidence: ['apps/worker/src/main.ts'] },
    { id: 'payment', title: 'Stripe', type: 'external', tech: 'Payments API', evidence: ['apps/api/src/payments.ts'] }
  ],
  edges: [
    { from: 'web', to: 'api', label: 'HTTP', evidence: ['apps/web/src/app/checkout/page.tsx'] },
    { from: 'api', to: 'db', label: 'Reads / writes', evidence: ['apps/api/src/db.ts'] },
    { from: 'api', to: 'queue', label: 'Enqueues', evidence: ['apps/api/src/queue.ts'] },
    { from: 'api', to: 'payment', label: 'Charges', inferred: true, evidence: ['apps/api/src/payments.ts'] },
    { from: 'queue', to: 'worker', label: 'Delivers jobs', evidence: ['apps/worker/src/main.ts'] }
  ],
  notes: []
};
