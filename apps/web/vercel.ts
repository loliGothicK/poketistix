import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  regions: ["bom1"],
  git: {
    deploymentEnabled: {
      "renovate/*": false,
    },
  },
  ignoreCommand: 'echo "$VERCEL_GIT_COMMIT_MESSAGE" | grep -qF "[skip deploy]"',
};
