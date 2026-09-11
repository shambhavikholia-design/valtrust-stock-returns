import 'dotenv/config';
import { createApp } from './app.js';

const PORT = process.env.PORT || 4000;

if (!process.env.INDIANAPI_KEY) {
  console.error(
    '\n[startup error] INDIANAPI_KEY is not set.\n' +
      'Copy server/.env.example to server/.env and add your key from https://indianapi.in/dashboard\n'
  );
  process.exit(1);
}

const app = createApp();

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
