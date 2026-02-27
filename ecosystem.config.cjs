module.exports = {
  apps: [
    {
      name: "design-tool",
      script: "npm",
      args: "start",
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
