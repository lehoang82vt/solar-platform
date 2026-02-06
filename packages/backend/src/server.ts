import app from './app';
import { config } from './config/env';
import { connectDatabase } from './config/database';

async function startServer(): Promise<void> {
  try {
    await connectDatabase();
    
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${config.port}`);
      console.log(`Health check: http://0.0.0.0:${config.port}/api/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
