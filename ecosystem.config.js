module.exports = {
  apps: [
    {
      name: 'routinebot',
      script: './dist/index.js',
      cwd: './backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        SERVE_STATIC: 'true',
        STATIC_FILES_PATH: '../frontend/dist'
      }
    }
  ]
};
