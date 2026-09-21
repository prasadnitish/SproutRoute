// Local-only runtime evidence server. Forward provider configuration in the parent process;
// intentionally omit production database credentials and bind only to loopback.
process.env.NODE_ENV='production';
process.env.TRACE_ENVIRONMENT='local-live-providers';
process.env.TRACE_BUILD='f6b41b4+portfolio-observability-working-tree';
process.env.ALLOWED_ORIGINS='http://127.0.0.1:4317';
const {createApp}=await import('../src/backend/server.js');
createApp().listen(4317,'127.0.0.1',()=>console.log('Evidence app ready at http://127.0.0.1:4317'));
