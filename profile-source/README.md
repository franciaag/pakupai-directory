# Profile frontend

Run `npm ci` here, then build from this directory:

```sh
npx esbuild account.js --bundle --minify --format=iife --target=es2020 --outfile=../account/account.js
npx esbuild profile-session.js --bundle --minify --format=iife --target=es2020 --outfile=../profile-session.js
```

Only the public Supabase publishable key belongs in these browser modules. Never add a secret or service-role key.
