import http from 'node:http';

export function createSchedulerHttpServer({
  config,
  logger,
  triggerRun,
  host = process.env.HTTP_HOST || '127.0.0.1',
  port = Number(process.env.HTTP_PORT || 3000)
}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid HTTP_PORT "${port}". Expected a valid TCP port.`);
  }

  let isRunning = false;
  let lastRun = null;

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/health') {
        return json(response, 200, {
          ok: true,
          scheduler: {
            timezone: config.timezone,
            scheduleTimes: config.scheduleTimes,
            providers: config.enabledProviders
          },
          trigger: {
            running: isRunning,
            lastRun
          }
        });
      }

      if (request.method === 'POST' && request.url === '/trigger') {
        if (isRunning) {
          return json(response, 409, {
            ok: false,
            error: 'Scheduler run already in progress.'
          });
        }

        isRunning = true;
        const startedAt = new Date().toISOString();
        await logger?.info('Manual trigger requested', { startedAt });

        try {
          const result = await triggerRun();
          lastRun = {
            startedAt,
            finishedAt: new Date().toISOString(),
            success: result.results.every((item) => item.success),
            prompt: result.prompt,
            resultCount: result.results.length
          };

          await logger?.info('Manual trigger completed', lastRun);
          return json(response, 200, {
            ok: true,
            ...result
          });
        } catch (error) {
          lastRun = {
            startedAt,
            finishedAt: new Date().toISOString(),
            success: false,
            error: error.message
          };

          await logger?.error('Manual trigger failed', { startedAt, error: error.message });
          return json(response, 500, {
            ok: false,
            error: error.message
          });
        } finally {
          isRunning = false;
        }
      }

      return json(response, 404, {
        ok: false,
        error: 'Not found.'
      });
    } catch (error) {
      await logger?.error('HTTP handler failed', { error: error.message });
      return json(response, 500, {
        ok: false,
        error: error.message
      });
    }
  });

  return {
    host,
    port,
    server,
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve();
        });
      });
    }
  };
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload, null, 2));
}
