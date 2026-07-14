# Contributing

This is a proprietary private project. Contributions require the owner's permission and do not grant a license to reuse the code.

Use Node 22 (`nvm use`), run `npm ci`, and create focused branches. Before review, run:

```bash
npm run check
npm run test:rules
```

Never commit `.env` files, Firebase service credentials, user backups, screenshots containing private notes, or production data. Schema changes need migration and rollback tests. Sync changes need offline, reconnect, conflict, deletion, purge, and cross-user tests.
