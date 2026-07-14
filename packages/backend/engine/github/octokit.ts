import { Octokit } from "@octokit/core";

const GITHUB_API_VERSION = "2022-11-28";

// shared Octokit client for GitHub REST (Bearer token)
export function createGithubOctokit(token: string): Octokit {
  return new Octokit({
    auth: token,
    request: {
      headers: {
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    },
  });
}
