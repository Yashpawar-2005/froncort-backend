const path = require("path");

module.exports = {
    apps: [
        {
            name: "froncort-api",
            script: "./dist/index.js",
            cwd: path.join(__dirname, "backend"),
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: "500M",
            env_file: path.join(__dirname, "backend", ".env"),
            env: {
                NODE_ENV: "production",
            },
        },
        {
            name: "froncort-workers",
            script: "./dist/index.js",
            cwd: path.join(__dirname, "updatedocs"),
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: "300M",
            env_file: path.join(__dirname, "updatedocs", ".env"),
            env: {
                NODE_ENV: "production",
            },
        },
    ],
};
