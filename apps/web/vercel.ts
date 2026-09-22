import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  git: {
    deploymentEnabled: {
      "renovate/*": false,
    },
  },
  ignoreCommand: 'echo "$VERCEL_GIT_COMMIT_MESSAGE" | grep -qF "[skip]"',
};
