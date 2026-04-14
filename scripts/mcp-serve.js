#!/usr/bin/env node
/**
 * Entry point for the DevOps Pilot MCP server.
 * Launch this from an MCP client (Claude Desktop, Cursor, VS Code, Zed).
 * Communicates over stdio.
 *
 * Example client config (Claude Desktop):
 *   {
 *     "mcpServers": {
 *       "devops-pilot": {
 *         "command": "node",
 *         "args": ["C:/Code/Personal/DevOps-Pilot/scripts/mcp-serve.js"]
 *       }
 *     }
 *   }
 *
 * Requires the DevOps Pilot app to be running (listening on 127.0.0.1:3800).
 */
require('../dashboard/mcp-server');
